import type { Env } from '~/types/Env'
import type { ClientMessage, ServerMessage, User } from '~/types/Messages'
import { assertError } from '~/utils/assertError'
import assertNever from '~/utils/assertNever'
import getUsername from '~/utils/getUsername.server'

import { eq, inArray, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
	Server,
	type Connection,
	type ConnectionContext,
	type WSMessage,
} from 'partyserver'
import {
	AnalyticsSimpleCallFeedback,
	getDb,
	Meetings,
	Transcripts,
} from 'schema'
import invariant from 'tiny-invariant'
import { log } from '~/utils/logging'
import {
	CallsNewSession,
	CallsSession,
	checkNewTracksResponse,
	requestOpenAIService,
	type SessionDescription,
} from '~/utils/openai.server'
import {
	transcribeWithWorkersAi,
	createAssemblyAiStreamingSession,
	type AssemblyAiStreamingSession,
} from '~/utils/asr.server'
import { translate } from '~/utils/translation.server'

const alarmInterval = 15_000
const endedMeetingCleanupInterval = 10 * 60 * 1000
const defaultOpenAIModelID = 'gpt-4o-realtime-preview-2024-10-01'
const defaultWorkersAiAsrModel = '@cf/deepgram/nova-3'
const defaultWorkersAiTargetLangs = ['en', 'zh']
const defaultMeetingRetentionMinutes = 24 * 60

/**
 * The ChatRoom Durable Object Class
 *
 * ChatRoom implements a Durable Object that coordinates an
 * individual chat room. Participants connect to the room using
 * WebSockets, and the room broadcasts messages from each participant
 * to all others.
 */
export class ChatRoom extends Server<Env> {
	env: Env
	db: DrizzleD1Database<Record<string, never>> | null
	// 动态语言池：追踪房间内用户需要的语言
	roomLanguages: Set<string> = new Set()
	userLanguageMap: Map<string, Set<string>> = new Map()
	// Assembly AI 流式会话管理
	assemblyAiSessions: Map<string, AssemblyAiStreamingSession> = new Map()

	private parseAcceptLanguageHeader(acceptLanguage: string | null): string[] {
		if (!acceptLanguage) return ['en']

		const langs = acceptLanguage
			.split(',')
			.map((item) => item.split(';')[0]?.trim().toLowerCase())
			.filter(Boolean)

		return langs.length > 0 ? langs : ['en']
	}

	// static options = { hibernate: true }

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.env = env
		this.db = getDb({ env })
	}

	// a small typesafe wrapper around connection.send
	sendMessage<M extends ServerMessage>(connection: Connection, message: M) {
		connection.send(JSON.stringify(message))
	}

	async onStart(): Promise<void> {
		const meetingId = await this.getMeetingId()
		log({ eventName: 'onStart', meetingId })
		this.db = getDb({ env: this.env })
	}

	async onRequest(request: Request): Promise<Response> {
		try {
			const url = new URL(request.url)
			if (url.pathname === '/exists') {
				const meetingId = await this.ctx.storage.get<string>('meetingId')
				if (meetingId) {
					return new Response('OK', { status: 200 })
				}
				return new Response('Not Found', { status: 404 })
			}
			if (url.pathname === '/create' && request.method === 'POST') {
				let meetingId = await this.ctx.storage.get<string>('meetingId')
				if (!meetingId) {
					const roomName =
						request.headers.get('x-partykit-room') || this.ctx.id.toString()
					meetingId = await this.createMeeting(roomName)
				}
				return new Response(JSON.stringify({ meetingId }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			}
			return super.onRequest(request)
		} catch (err) {
			console.error('DO Request Error:', err)
			return new Response(String(err), { status: 500 })
		}
	}

	async onConnect(
		connection: Connection<User>,
		ctx: ConnectionContext
	): Promise<void> {
		// let's start the periodic alarm if it's not already started
		if (!(await this.ctx.storage.getAlarm())) {
			// start the alarm to broadcast state every 30 seconds
			this.ctx.storage.setAlarm(Date.now() + alarmInterval)
		}

		const username =
			(await getUsername(ctx.request)) || 'Guest-' + connection.id.slice(0, 4)
		const browserLanguages = this.parseAcceptLanguageHeader(
			ctx.request.headers.get('accept-language')
		)

		try {
			// Prevent duplicate sessions for the same user
			for (const otherConnection of this.getConnections<User>()) {
				if (otherConnection.id !== connection.id) {
					const otherUser = await this.ctx.storage.get<User>(
						`session-${otherConnection.id}`
					)
					if (
						otherUser &&
						otherUser.name === username &&
						username !== 'Guest-' + otherConnection.id.slice(0, 4)
					) {
						// Notify the old connection and close it
						this.sendMessage(otherConnection, {
							type: 'error',
							error:
								'You joined from another tab or device. This session has been closed.',
						})
						otherConnection.close(1011, 'Duplicate session')
						// Clean up their storage immediately so they don't appear in the list
						await this.ctx.storage.delete(`session-${otherConnection.id}`)
						await this.ctx.storage.delete(`heartbeat-${otherConnection.id}`)
					}
				}
			}

			let user = await this.ctx.storage.get<User>(`session-${connection.id}`)
			const foundInStorage = user !== undefined
			if (!foundInStorage) {
				user = {
					id: connection.id,
					name: username,
					joined: false,
					raisedHand: false,
					speaking: false,
					tracks: {
						audioEnabled: false,
						audioUnavailable: false,
						videoEnabled: false,
						screenShareEnabled: false,
					},
				}
			}

			// store the user's data in storage
			await this.ctx.storage.put(`session-${connection.id}`, user)
			await this.ctx.storage.put(`heartbeat-${connection.id}`, Date.now())
			// Store room name from WebSocket request on first connect
			const storedRoomName = await this.ctx.storage.get<string>('roomName')
			if (!storedRoomName) {
				const roomName = ctx.request.headers.get('x-partykit-room')
				if (roomName) {
					await this.ctx.storage.put('roomName', roomName)
				}
			}
			await this.trackPeakUserCount()
			// 只在加入时更新语言池
			this.addUserLanguages(connection.id, browserLanguages)
			await this.broadcastRoomState()
			const meetingId = await this.getMeetingId()
			log({
				eventName: 'onConnect',
				meetingId,
				foundInStorage,
				connectionId: connection.id,
			})
		} catch (err) {
			console.error('Error during onConnect session setup:', err)
			// Still try to broadcast state even if some setup failed
			await this.broadcastRoomState()
		}
	}

	async trackPeakUserCount() {
		let meetingId = await this.getMeetingId()
		if (!meetingId) {
			meetingId = await this.createMeeting()
		}
		const meeting = await this.getMeeting(meetingId)

		await this.cleanupOldConnections()
		if (this.db && meeting) {
			const updates: any = {}

			if (meeting.ended !== null) {
				updates.ended = null
			}

			if (!meeting.roomName) {
				// Try to get readable room name from stored value, fallback to DO ID
				const storedRoomName = await this.ctx.storage.get<string>('roomName')
				updates.roomName = storedRoomName || this.ctx.id.toString()
			}

			const userCount = (await this.getUsers()).size
			if (userCount > meeting.peakUserCount) {
				updates.peakUserCount = userCount
			}

			if (Object.keys(updates).length > 0) {
				try {
					await this.db
						.update(Meetings)
						.set(updates)
						.where(eq(Meetings.id, meeting.id))
						.run()
					console.log('D1 Success: Updated meeting state', meetingId, updates)
				} catch (e) {
					console.error('D1 Error: Failed to update meeting peak user count', e)
				}
			}
		}
		return meetingId
	}

	async getMeetingId() {
		return this.ctx.storage.get<string>('meetingId')
	}

	async createMeeting(roomName?: string) {
		const meetingId = crypto.randomUUID()
		const startTime = Date.now()
		const finalRoomName = roomName || this.ctx.id.toString()
		await this.ctx.storage.put('meetingId', meetingId)
		await this.ctx.storage.put('startTime', startTime)
		// Store the human-readable room name
		if (roomName) {
			await this.ctx.storage.put('roomName', roomName)
		}
		log({ eventName: 'startingMeeting', meetingId, startTime })
		if (this.db) {
			try {
				// 使用 .run() 确保在 D1 中实际执行
				const result = await this.db
					.insert(Meetings)
					.values({
						id: meetingId,
						roomName: finalRoomName,
						peakUserCount: 1,
					})
					.run()
				console.log(
					'D1 Success: Created meeting record',
					meetingId,
					'Changes:',
					result.meta?.changes || result
				)
			} catch (e) {
				console.error('D1 Error: Failed to create meeting record', e)
			}
		} else {
			console.warn('D1 Warning: Database not found during meeting creation')
		}
		return meetingId
	}

	async getMeeting(meetingId: string) {
		if (!this.db) return null
		const [meeting] = await this.db
			.select()
			.from(Meetings)
			.where(eq(Meetings.id, meetingId))

		return meeting
	}

	async broadcastMessage(
		message: ServerMessage,
		excludedConnection?: Connection
	) {
		let didSomeoneQuit = false
		const meetingId = await this.getMeetingId()
		const messageAsString = JSON.stringify(message)

		for (const connection of this.getConnections()) {
			try {
				if (excludedConnection && connection === excludedConnection) continue
				connection.send(messageAsString)
			} catch (err) {
				connection.close(1011, 'Failed to broadcast state')
				log({
					eventName: 'errorBroadcastingToUser',
					meetingId,
					connectionId: connection.id,
				})
				await this.ctx.storage.delete(`session-${connection.id}`)
				didSomeoneQuit = true
			}
		}

		if (didSomeoneQuit) {
			// broadcast again to remove the user who quit
			await this.broadcastRoomState()
		}
	}

	async broadcastRoomState() {
		const meetingId = await this.getMeetingId()
		const startTime = await this.ctx.storage.get<number>('startTime')
		const aiEnabled =
			(await this.ctx.storage.get<boolean>('ai:enabled')) ?? false
		const aiSessionId =
			(await this.ctx.storage.get<string>('ai:sessionId')) ?? undefined
		const aiAudioTrack =
			(await this.ctx.storage.get<string>('ai:trackName')) ?? undefined
		const roomState = {
			type: 'roomState',
			state: {
				ai: {
					enabled: aiEnabled,
					controllingUser:
						await this.ctx.storage.get<string>('ai:userControlling'),
					connectionPending: await this.ctx.storage.get<boolean>(
						'ai:connectionPending'
					),
					error: await this.ctx.storage.get<string>('ai:error'),
				},
				meetingId,
				startTime,
				users: [
					...(await this.getUsers()).values(),
					...(aiEnabled
						? [
								{
									id: 'ai',
									name: 'AI',
									joined: true,
									raisedHand: false,
									transceiverSessionId: aiSessionId,
									speaking: false,
									tracks: {
										audioEnabled: true,
										audio: aiSessionId + '/' + aiAudioTrack,
										audioUnavailable: false,
										videoEnabled: false,
										screenShareEnabled: false,
									},
								} satisfies User,
							]
						: []),
				],
			},
		} satisfies ServerMessage
		return this.broadcastMessage(roomState)
	}

	async onClose(
		connection: Connection,
		code: number,
		reason: string,
		wasClean: boolean
	) {
		const meetingId = await this.getMeetingId()
		log({
			eventName: 'onClose',
			meetingId,
			connectionId: connection.id,
			code,
			reason,
			wasClean,
		})

		// Remove session storage immediately when connection is closed
		await this.ctx.storage.delete(`session-${connection.id}`)
		await this.ctx.storage.delete(`heartbeat-${connection.id}`)

		// 清理用户语言
		this.removeUserLanguage(connection.id)

		// 清理 Assembly AI 流式会话
		const assemblySession = this.assemblyAiSessions.get(connection.id)
		if (assemblySession) {
			assemblySession.disconnect()
			this.assemblyAiSessions.delete(connection.id)
		}

		// Notify others
		this.userLeftNotification(connection.id)
		await this.broadcastRoomState()
	}

	// 添加用户语言到动态语言池
	addUserLanguages(userId: string, languages: string[]) {
		console.log('[Language Pool] Adding user languages:', { userId, languages })
		
		// 规范化语言代码（取前2位，例如 zh-CN -> zh）
		const langCodes = new Set(
			languages.map(lang => lang.toLowerCase().split('-')[0])
		)
		
		const oldLangs = this.userLanguageMap.get(userId)
		
		// 更新用户的语言集合
		this.userLanguageMap.set(userId, langCodes)
		
		// 将所有语言添加到房间语言池
		for (const langCode of langCodes) {
			this.roomLanguages.add(langCode)
		}
		
		log({
			eventName: 'userLanguagesAdded',
			userId,
			languages: Array.from(langCodes),
			roomLanguages: Array.from(this.roomLanguages),
		})
		
		console.log('[Language Pool] Updated:', {
			userId,
			langCodes: Array.from(langCodes),
			roomLanguages: Array.from(this.roomLanguages),
			userCount: this.userLanguageMap.size
		})
	}

	setUserLanguagePreference(userId: string, languages: string[]) {
		const langCodes = new Set(
			languages.map((lang) => lang.toLowerCase().split('-')[0]).filter(Boolean)
		)
		this.userLanguageMap.set(userId, langCodes)
		console.log('[Language Pool] User preference updated (pool unchanged until rejoin):', {
			userId,
			langCodes: Array.from(langCodes),
			roomLanguages: Array.from(this.roomLanguages),
		})
	}

	// 移除用户语言（用户离开时）
	removeUserLanguage(userId: string) {
		const userLangs = this.userLanguageMap.get(userId)
		if (userLangs) {
			this.userLanguageMap.delete(userId)
			
			// 重新计算房间语言池：仅保留其他用户需要的语言
			this.roomLanguages.clear()
			for (const langs of this.userLanguageMap.values()) {
				for (const lang of langs) {
					this.roomLanguages.add(lang)
				}
			}
			
			log({
				eventName: 'userLanguagesRemoved',
				userId,
				roomLanguages: Array.from(this.roomLanguages),
			})
		}
	}

	// 获取当前房间需要翻译的语言列表
	getTargetLanguages(): string[] {
		// 如果房间内有用户，使用动态语言池
		if (this.roomLanguages.size > 0) {
			const langs = Array.from(this.roomLanguages)
			console.log('[Translation] Using dynamic language pool:', langs)
			return langs
		}
		// 否则使用配置的默认语言
		const defaultLangs = (
			this.env.WORKERS_AI_TRANSLATION_TARGET_LANGS?.split(',')
				.map((lang) => lang.trim())
				.filter(Boolean) ?? defaultWorkersAiTargetLangs
		)
		console.log('[Translation] Using default languages:', defaultLangs)
		return defaultLangs
	}

	async handleAudioChunk(
		connection: Connection<User>,
		data: { type: 'audioChunk'; data: string }
	) {
		// 云端CC（语音识别）独立开关，向后兼容
		const asrEnabled =
			this.env.ENABLE_WORKERS_AI_ASR === 'true' ||
			(this.env.ENABLE_WORKERS_AI_ASR === undefined &&
				this.env.ENABLE_WORKERS_AI === 'true')
		
		if (!asrEnabled) return

		const asrProvider = this.env.ASR_PROVIDER || 'workers-ai'
		
		if (asrProvider === 'assembly-ai') {
			await this.handleAssemblyAiAudioChunk(connection, data)
		} else {
			await this.handleWorkersAiAudioChunk(connection, data)
		}
	}

	private async handleWorkersAiAudioChunk(
		connection: Connection<User>,
		data: { type: 'audioChunk'; data: string }
	) {
		try {
			const result = await transcribeWithWorkersAi(this.env, data.data)

			if (result && result.text.trim()) {
				const captionMessage = {
					type: 'caption',
					userId: connection.id,
					text: result.text,
					isFinal: result.isFinal,
					translate: true, // Auto-translate for Workers AI ASR
				} as const

				this.broadcastMessage(captionMessage)

				// Trigger persistence and translation
				this.handleCaption(connection, captionMessage).catch((err) => {
					console.error('Secondary caption handler error:', err)
				})
			}
		} catch (e) {
			console.error('Workers AI ASR Error:', e)
		}
	}

	private async handleAssemblyAiAudioChunk(
		connection: Connection<User>,
		data: { type: 'audioChunk'; data: string }
	) {
		const apiKey = this.env.ASSEMBLY_AI_API_KEY
		if (!apiKey) {
			console.error('Assembly AI API Key not configured')
			return
		}

		try {
			// 获取或创建该用户的 Assembly AI 流式会话
			let session = this.assemblyAiSessions.get(connection.id)
			
			if (!session) {
				const model = this.env.ASSEMBLY_AI_ASR_MODEL || 'universal-streaming-multilingual'
				
				// 创建新会话
				session = createAssemblyAiStreamingSession(
					apiKey,
					model,
					(result) => {
						// 收到转录结果的回调
						console.log('[Assembly AI] Transcription result:', { 
							text: result.text, 
							isFinal: result.isFinal 
						})
						
						const captionMessage = {
							type: 'caption',
							userId: connection.id,
							text: result.text,
							isFinal: result.isFinal,
							translate: true, // Auto-translate for Assembly AI ASR
						} as const

						this.broadcastMessage(captionMessage)

						// 如果是最终结果，触发持久化和翻译
						if (result.isFinal) {
							console.log('[Assembly AI] Final result, triggering translation')
							this.handleCaption(connection, captionMessage).catch((err) => {
								console.error('Assembly AI caption handler error:', err)
							})
						}
					}
				)
				
				// 连接到 Assembly AI
				await session.connect()
				this.assemblyAiSessions.set(connection.id, session)
			}
			
			// 发送音频数据到 Assembly AI
			session.sendAudio(data.data)
		} catch (e) {
			console.error('Assembly AI Streaming Error:', e)
		}
	}

	async handleCaption(
		connection: Connection<User>,
		data: { text: string; isFinal: boolean; translate?: boolean }
	) {
		console.log('[Caption] Handling caption:', { 
			text: data.text, 
			isFinal: data.isFinal, 
			translate: data.translate 
		})
		
		if (!data.isFinal) return

		// 1) 持久化字幕（失败不影响后续翻译）
		if (this.db) {
			try {
				const meetingId = await this.getMeetingId()
				if (meetingId) {
					const user = await this.ctx.storage.get<User>(
						`session-${connection.id}`
					)
					await this.db
						.insert(Transcripts)
						.values({
							meetingId,
							userId: connection.id,
							userName: user?.name || 'Unknown',
							text: data.text,
						})
						.run()
				}
			} catch (dbErr) {
				console.error('D1 Transcript Persistence Error:', dbErr)
			}
		}

		// 2) 自动翻译（不依赖 DB）
		if (data.translate) {
			try {
				console.log('[Translation] Starting translation for text:', data.text)
				const targetLangs = this.getTargetLanguages()
				console.log('[Translation] Target languages:', targetLangs)

				if (targetLangs.length === 0) {
					console.warn('[Translation] No target languages configured, skipping translation')
					return
				}

				const translations = await translate(
					this.env,
					data.text,
					targetLangs
				)
				console.log('[Translation] Received translations:', translations.length)

				for (const translation of translations) {
					console.log(`[Translation] Broadcasting: [${translation.language}] ${translation.text}`)
					this.broadcastMessage({
						type: 'caption',
						userId: connection.id,
						text: `[${translation.language.toUpperCase()}] ${translation.text}`,
						isFinal: true,
					})
				}
			} catch (e) {
				console.error('[Translation] Error:', e)
			}
		}
	}

	async onMessage(
		connection: Connection<User>,
		message: WSMessage
	): Promise<void> {
		try {
			const meetingId = await this.getMeetingId()
			if (typeof message !== 'string') {
				console.warn('Received non-string message')
				return
			}

			let data: ClientMessage = JSON.parse(message)

			switch (data.type) {
				case 'userLeft': {
					connection.close(1000, 'User left')
					this.userLeftNotification(connection.id)
					// 清理用户语言
					this.removeUserLanguage(connection.id)
					await this.ctx.storage
						.delete(`session-${connection.id}`)
						.catch(() => {
							console.warn(
								`Failed to delete session session-${connection.id} on userLeft`
							)
						})
					await this.ctx.storage
						.delete(`heartbeat-${connection.id}`)
						.catch(() => {
							console.warn(
								`Failed to delete session session-heartbeat-${connection.id} on userLeft`
							)
						})
					log({ eventName: 'userLeft', meetingId, connectionId: connection.id })

					await this.broadcastRoomState()
					break
				}
				case 'userUpdate': {
					this.ctx.storage.put(`session-${connection.id}`, data.user)
					await this.broadcastRoomState()
					break
				}
				case 'caption': {
					this.broadcastMessage({
						type: 'caption',
						userId: connection.id,
						text: data.text,
						isFinal: data.isFinal,
					})

					// Process DB and translation asynchronously
					this.handleCaption(connection, data).catch((e) => {
						console.error('Error handling caption:', e)
					})
					break
				}
				case 'audioChunk': {
					await this.handleAudioChunk(connection, data)
					break
				}
				case 'callsApiHistoryEntry': {
					const { entry, sessionId } = data
					log({
						eventName: 'clientNegotiationRecord',
						connectionId: connection.id,
						meetingId,
						entry,
						sessionId,
					})
					break
				}
				case 'directMessage': {
					const { to, message } = data
					const fromUser = await this.ctx.storage.get<User>(
						`session-${connection.id}`
					)

					for (const otherConnection of this.getConnections<User>()) {
						if (otherConnection.id === to) {
							this.sendMessage(otherConnection, {
								type: 'directMessage',
								from: fromUser!.name,
								message,
							})
							break
						}
					}
					console.warn(
						`User with id "${to}" not found, cannot send DM from "${fromUser!.name}"`
					)
					break
				}
				case 'roomMessage': {
					const { message } = data
					const fromUser = await this.ctx.storage.get<User>(
						`session-${connection.id}`
					)

					for (const otherConnection of this.getConnections<User>()) {
						if (otherConnection.id !== connection.id) {
							this.sendMessage(otherConnection, {
								type: 'roomMessage',
								from: fromUser!.name,
								message,
							})
						}
					}
					break
				}
				case 'muteUser': {
					const user = await this.ctx.storage.get<User>(
						`session-${connection.id}`
					)
					let mutedUser = false
					for (const otherConnection of this.getConnections<User>()) {
						if (otherConnection.id === data.id) {
							const otherUser = await this.ctx.storage.get<User>(
								`session-${data.id}`
							)
							await this.ctx.storage.put(`session-${data.id}`, {
								...otherUser!,
								tracks: {
									...otherUser!.tracks,
									audioEnabled: false,
								},
							})
							this.sendMessage(otherConnection, {
								type: 'muteMic',
							})

							await this.broadcastRoomState()
							mutedUser = true
							break
						}
					}
					if (!mutedUser) {
						console.warn(
							`User with id "${data.id}" not found, cannot mute user from "${user!.name}"`
						)
					}
					break
				}

				case 'partyserver-ping': {
					// do nothing, this should never be received
					console.warn(
						"Received partyserver-ping from client. You shouldn't be seeing this message. Did you forget to enable hibernation?"
					)
					break
				}
				case 'e2eeMlsMessage': {
					// forward as-is
					this.broadcastMessage(data, connection)
					break
				}
				case 'heartbeat': {
					await this.ctx.storage.put(`heartbeat-${connection.id}`, Date.now())
					break
				}
				case 'setLanguage': {
					// 只记录偏好，不即时更新语言池（语言池仅在加入/离开时更新）
					this.setUserLanguagePreference(connection.id, data.languages)
					break
				}
				case 'disableAi': {
					await this.ctx.storage
						.list({
							prefix: 'ai:',
						})
						.then((map) => {
							for (const key of map.keys()) {
								this.ctx.storage.delete(key)
							}
						})
					this.broadcastRoomState()

					break
				}
				case 'enableAi': {
					await this.ctx.storage.put('ai:connectionPending', true)
					await this.ctx.storage.delete('ai:error')
					this.broadcastRoomState()

					try {
						// This session establishes a PeerConnection between Calls and OpenAI.
						// CallsNewSession thirdparty parameter must be true to be able to connect to an external WebRTC server
						const openAiSession = await CallsNewSession(
							this.env.CALLS_APP_ID,
							this.env.CALLS_APP_SECRET,
							this.env.API_EXTRA_PARAMS,
							await this.getMeetingId(),
							true
						)
						const openAiTracksResponse = await openAiSession.NewTracks({
							// No offer is provided so Calls will generate one for us
							tracks: [
								{
									location: 'local',
									trackName: 'ai-generated-voice',
									// Let it know a sendrecv transceiver is wanted to receive this track instead of a recvonly one
									bidirectionalMediaStream: true,
									// Needed to create an appropriate response
									kind: 'audio',
								},
							],
						})
						checkNewTracksResponse(openAiTracksResponse, true)

						invariant(this.env.OPENAI_MODEL_ENDPOINT)
						invariant(this.env.OPENAI_API_TOKEN)

						const params = new URLSearchParams()
						const { voice, instructions } = data
						if (voice) {
							params.set('voice', voice)
						}
						if (instructions) {
							params.set('instructions', instructions)
						}

						params.set(
							'model',
							this.env.OPENAI_MODEL_ID || defaultOpenAIModelID
						)

						// The Calls's offer is sent to OpenAI
						const openaiAnswer = await requestOpenAIService(
							openAiTracksResponse.sessionDescription ||
								({} as SessionDescription),
							this.env.OPENAI_API_TOKEN,
							this.env.OPENAI_MODEL_ENDPOINT,
							params
						)

						console.log('OpenAI answer', openaiAnswer)

						// And the negotiation is completed by setting the answer from OpenAI
						const renegotiationResponse =
							await openAiSession.Renegotiate(openaiAnswer)
						console.log('renegotiationResponse', renegotiationResponse)

						console.log('set ai:sessionId', openAiSession.sessionId)
						await this.ctx.storage.put('ai:sessionId', openAiSession.sessionId)
						await this.ctx.storage.put(
							'ai:trackName',
							openAiTracksResponse.tracks[0].trackName
						)
						await this.ctx.storage.put('ai:enabled', true)
						await this.ctx.storage.put('ai:connectionPending', false)
						this.broadcastRoomState()

						break
					} catch (error) {
						console.error(error)
						await this.ctx.storage.put('ai:connectionPending', false)
						await this.ctx.storage.put(
							'ai:error',
							'Error establishing connection with AI'
						)
						this.broadcastRoomState()
						break
					}
				}
				case 'requestAiControl': {
					const userControllingPending = await this.ctx.storage.get<string>(
						'ai:userControlling:pending'
					)
					if (userControllingPending) {
						break
					}
					await this.ctx.storage.put(
						'ai:userControlling:pending',
						connection.id
					)
					try {
						const aiSessionId =
							await this.ctx.storage.get<string>('ai:sessionId')
						invariant(aiSessionId)
						const openAiSession = new CallsSession(
							aiSessionId,
							{
								Authorization: `Bearer ${this.env.CALLS_APP_SECRET}`,
								'Content-Type': 'application/json',
							},
							`https://rtc.live.cloudflare.com/apps/${this.env.CALLS_APP_ID}`
						)

						const { track } = data

						console.log('starting exchangeStepTwo, pulling', {
							session: track.sessionId,
							trackName: track.trackName,
						})
						const exchangeStepTwo = await openAiSession.NewTracks({
							tracks: [
								{
									location: 'remote',
									sessionId: track.sessionId,
									trackName: track.trackName,
									// Let Calls to find out the actual mid value
									mid: `#ai-generated-voice`,
								},
							],
						})

						console.log('exchangeStepTwo result', exchangeStepTwo)
						checkNewTracksResponse(exchangeStepTwo)

						await this.ctx.storage.put('ai:userControlling', connection.id)
						this.broadcastRoomState()
					} finally {
						await this.ctx.storage.delete('ai:userControlling:pending')
					}
					break
				}
				case 'relenquishAiControl': {
					await this.ctx.storage.delete('ai:userControlling:pending')
					this.ctx.storage.delete('ai:userControlling')
					this.broadcastRoomState()
					break
				}
				default: {
					assertNever(data)
					break
				}
			}
		} catch (error) {
			const meetingId = await this.getMeetingId()
			log({
				eventName: 'errorHandlingMessage',
				meetingId,
				connectionId: connection.id,
				error,
			})
			assertError(error)
			// TODO: should this even be here?
			// Report any exceptions directly back to the client. As with our handleErrors() this
			// probably isn't what you'd want to do in production, but it's convenient when testing.
			this.sendMessage(connection, {
				type: 'error',
				error: error.stack,
			} satisfies ServerMessage)
		}
	}

	onError(connection: Connection, error: unknown): void | Promise<void> {
		log({
			eventName: 'onErrorHandler',
			error,
		})
		return this.getMeetingId().then((meetingId) => {
			log({
				eventName: 'onErrorHandlerDetails',
				meetingId,
				connectionId: connection.id,
				error,
			})
			this.broadcastRoomState()
		})
	}

	getUsers() {
		return this.ctx.storage.list<User>({
			prefix: 'session-',
		})
	}

	private getMeetingRetentionMinutes(): number {
		const parsed = Number(this.env.MEETING_RETENTION_MINUTES)
		if (!Number.isFinite(parsed) || parsed <= 0) {
			return defaultMeetingRetentionMinutes
		}
		return Math.floor(parsed)
	}

	private async cleanupEndedMeetingsIfNeeded(options?: { force?: boolean }) {
		if (!this.db) return
		const force = options?.force === true

		const now = Date.now()
		const lastCleanupAt =
			(await this.ctx.storage.get<number>('meetingCleanupLastRunAt')) ?? 0
		if (!force && now - lastCleanupAt < endedMeetingCleanupInterval) return

		await this.ctx.storage.put('meetingCleanupLastRunAt', now)

		const retentionMinutes = this.getMeetingRetentionMinutes()
		const expiredMeetings = await this.db
			.select({ id: Meetings.id })
			.from(Meetings)
			.where(
				sql`(
					${Meetings.ended} IS NOT NULL
					AND ${Meetings.ended} <= datetime('now', '-' || ${retentionMinutes} || ' minutes')
				) OR (
					${Meetings.ended} IS NULL
					AND ${Meetings.modified} <= datetime('now', '-' || ${retentionMinutes} || ' minutes')
				)`
			)

		if (expiredMeetings.length === 0) return

		const expiredMeetingIds = expiredMeetings.map((m) => m.id)

		await this.db
			.delete(AnalyticsSimpleCallFeedback)
			.where(inArray(AnalyticsSimpleCallFeedback.meetingId, expiredMeetingIds))
			.run()

		await this.db
			.delete(Transcripts)
			.where(inArray(Transcripts.meetingId, expiredMeetingIds))
			.run()

		await this.db
			.delete(Meetings)
			.where(inArray(Meetings.id, expiredMeetingIds))
			.run()

		log({
			eventName: 'cleanupEndedMeetings',
			expiredMeetingCount: expiredMeetingIds.length,
			retentionMinutes,
		})
	}

	async endMeeting(meetingId: string) {
		log({ eventName: 'endingMeeting', meetingId })
		if (this.db) {
			// stamp meeting as ended
			await this.db
				.update(Meetings)
				.set({
					ended: sql`CURRENT_TIMESTAMP`,
				})
				.where(eq(Meetings.id, meetingId))
				.run()

			await this.cleanupEndedMeetingsIfNeeded({ force: true })
		}
	}

	userLeftNotification(id: string) {
		this.broadcastMessage({
			type: 'userLeftNotification',
			id,
		})
	}

	async cleanupOldConnections() {
		const meetingId = await this.getMeetingId()
		if (!meetingId) log({ eventName: 'meetingIdNotFoundInCleanup' })
		const now = Date.now()
		const users = await this.getUsers()
		let removedUsers = 0
		const connections = [...this.getConnections()]

		for (const [key, user] of users) {
			const connectionId = key.replace('session-', '')
			const heartbeat = await this.ctx.storage.get<number>(
				`heartbeat-${connectionId}`
			)
			if (heartbeat === undefined || heartbeat + alarmInterval < now) {
				this.userLeftNotification(connectionId)
				removedUsers++
				await this.ctx.storage.delete(key).catch(() => {
					console.warn(
						`Failed to delete session ${key} in cleanupOldConnections`
					)
				})

				const connection = connections.find((c) => c.id === connectionId)
				if (connection) {
					connection.close(1011)
				}
				log({ eventName: 'userTimedOut', connectionId: user.id, meetingId })
			}
		}

		const activeUserCount = (await this.getUsers()).size

		if (meetingId && activeUserCount === 0) {
			this.endMeeting(meetingId)
		} else if (removedUsers > 0) {
			this.broadcastRoomState()
		}

		return activeUserCount
	}

	async alarm(): Promise<void> {
		const meetingId = await this.getMeetingId()
		log({ eventName: 'alarm', meetingId })
		const activeUserCount = await this.cleanupOldConnections()
		await this.cleanupEndedMeetingsIfNeeded()
		await this.broadcastRoomState()
		if (activeUserCount !== 0) {
			this.ctx.storage.setAlarm(Date.now() + alarmInterval)
		} else {
			// Keep low-frequency alarm so historical meeting cleanup still runs when room is idle.
			this.ctx.storage.setAlarm(Date.now() + endedMeetingCleanupInterval)
		}
	}
}
