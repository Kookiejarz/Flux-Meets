import type { Env } from '~/types/Env'

/**
 * ASR (Automatic Speech Recognition) Service
 * 支持多种语音识别提供商：Workers AI, Assembly AI
 */

const defaultWorkersAiAsrModel = '@cf/deepgram/nova-3'
const defaultAssemblyAiAsrModel = 'universal-streaming-multilingual'

export interface AsrResult {
	text: string
	isFinal: boolean
}

/**
 * Workers AI ASR - Cloudflare 原生语音识别
 */
export async function transcribeWithWorkersAi(
	env: Env,
	audioData: string // Base64 encoded audio
): Promise<AsrResult | null> {
	if (!env.AI) {
		console.error('Workers AI not available')
		return null
	}

	try {
		const asrModel = env.WORKERS_AI_ASR_MODEL || defaultWorkersAiAsrModel
		
		// Base64 to ArrayBuffer
		const audioBuffer = Uint8Array.from(atob(audioData), (c) =>
			c.charCodeAt(0)
		)

		const response: any = await env.AI.run(asrModel, {
			audio: {
				body: audioBuffer,
				contentType: 'audio/webm',
			},
			smart_format: true,
			detect_language: true,
		})

		if (response?.results?.channels[0]?.alternatives[0]?.transcript) {
			const text = response.results.channels[0].alternatives[0].transcript
			return {
				text,
				isFinal: true,
			}
		}

		return null
	} catch (e) {
		console.error('Workers AI ASR Error:', e)
		return null
	}
}

/**
 * Assembly AI Streaming Session Manager
 * 管理与 Assembly AI 的 WebSocket 流式连接
 */
export class AssemblyAiStreamingSession {
	private ws: WebSocket | null = null
	private apiKey: string
	private model: string
	private onTranscript: (result: AsrResult) => void
	private sessionId: string | null = null
	private audioQueue: Uint8Array[] = []
	private isConnected = false

	constructor(
		apiKey: string,
		model: string,
		onTranscript: (result: AsrResult) => void
	) {
		this.apiKey = apiKey
		this.model = model
		this.onTranscript = onTranscript
	}

	/**
	 * 连接到 Assembly AI Streaming API
	 */
	async connect(): Promise<void> {
		try {
			// Assembly AI Streaming v3 使用 WebSocket
			// API Key 需要通过 URL 参数或第一条消息传递
			const wsUrl = 'wss://streaming.assemblyai.com/v3'

			this.ws = new WebSocket(wsUrl)

			this.ws.addEventListener('open', () => {
				console.log('Assembly AI WebSocket connected')
				
				// 发送认证消息
				if (this.ws) {
					this.ws.send(
						JSON.stringify({
							auth: {
								api_key: this.apiKey,
							},
							// 配置参数
							speech_model: this.model,
							language_detection: true,
							format_turns: true,
							end_of_turn_confidence_threshold: 0.4,
							min_end_of_turn_silence_when_confident: 400,
							max_turn_silence: 1280,
							vad_threshold: 0.4,
							speaker_labels: true,
						})
					)
				}
				
				this.isConnected = true
				
				// 发送排队的音频数据
				while (this.audioQueue.length > 0) {
					const audioChunk = this.audioQueue.shift()
					if (audioChunk && this.ws) {
						this.ws.send(audioChunk)
					}
				}
			})

			this.ws.addEventListener('message', (event) => {
				this.handleMessage(event.data)
			})

			this.ws.addEventListener('error', (error) => {
				console.error('Assembly AI WebSocket error:', error)
				this.isConnected = false
			})

			this.ws.addEventListener('close', () => {
				console.log('Assembly AI WebSocket closed')
				this.isConnected = false
			})
		} catch (e) {
			console.error('Failed to connect to Assembly AI:', e)
			throw e
		}
	}

	/**
	 * 处理来自 Assembly AI 的消息
	 */
	private handleMessage(data: string) {
		try {
			// Assembly AI 响应格式: "MESSAGE {json}" 或 "{json}"
			let jsonData = data
			if (data.startsWith('MESSAGE ')) {
				jsonData = data.substring(8) // 移除 "MESSAGE " 前缀
			}
			
			const message = JSON.parse(jsonData)

			switch (message.type) {
				case 'SessionBegins':
					this.sessionId = message.session_id
					console.log(`Assembly AI session started: ${message.session_id}`)
					break

				case 'Turn':
					// 实时转录结果 - 只处理完整的句子（end_of_turn: true）
					if (message.end_of_turn && message.transcript && message.transcript.trim()) {
						this.onTranscript({
							text: message.transcript,
							isFinal: true,
						})
					}
					break

				case 'SessionTerminated':
					console.log(
						`Assembly AI session terminated: ${message.audio_duration_seconds || 0}s processed`
					)
					this.disconnect()
					break

				default:
					// 忽略其他事件类型（如 PartialTranscript）
					break
			}
		} catch (e) {
			console.error('Failed to parse Assembly AI message:', e, 'Raw data:', data)
		}
	}

	/**
	 * 发送音频数据到 Assembly AI
	 */
	sendAudio(audioData: string): void {
		try {
			// Base64 to ArrayBuffer
			const audioBuffer = Uint8Array.from(atob(audioData), (c) =>
				c.charCodeAt(0)
			)

			if (this.isConnected && this.ws) {
				// 发送音频数据（Assembly AI 期望 raw PCM 或 WebM）
				this.ws.send(audioBuffer)
			} else {
				// 如果未连接，加入队列
				this.audioQueue.push(audioBuffer)
			}
		} catch (e) {
			console.error('Failed to send audio to Assembly AI:', e)
		}
	}

	/**
	 * 断开连接
	 */
	disconnect(): void {
		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
		this.isConnected = false
		this.audioQueue = []
	}

	/**
	 * 获取会话 ID
	 */
	getSessionId(): string | null {
		return this.sessionId
	}

	/**
	 * 检查是否已连接
	 */
	isActive(): boolean {
		return this.isConnected
	}
}

/**
 * Assembly AI Streaming Session Factory
 * 为每个用户创建独立的 Assembly AI 流式会话
 */
export function createAssemblyAiStreamingSession(
	apiKey: string,
	model: string,
	onTranscript: (result: AsrResult) => void
): AssemblyAiStreamingSession {
	return new AssemblyAiStreamingSession(apiKey, model, onTranscript)
}
