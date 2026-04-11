import type { PartyTracks } from 'partytracks/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import invariant from 'tiny-invariant'
import type useRoom from '~/hooks/useRoom'
import { RELEASE } from '~/utils/constants'
import { hasOtherConnectedUsers } from '~/utils/e2eePeers'
import type { ClientMessage, ServerMessage } from '~/types/Messages'

function getE2eeWorkerUrl() {
	const runtimeRelease =
		typeof window !== 'undefined' ? window.ENV?.RELEASE : undefined
	const release = RELEASE ?? runtimeRelease
	const query = release ? `?v=${encodeURIComponent(release)}` : ''
	return `/e2ee/worker.v2.js${query}`
}

type TransformCoverage = {
	required: number
	bound: number
}

export type E2EEVerificationStatus = {
	enabled: boolean
	joined: boolean
	workerInitialized: boolean
	safetyNumberReady: boolean
	peerExchangeRequired: boolean
	peerExchangeCompleted: boolean
	peerExchangeParticipants: number
	mediaReadiness: {
		audio: {
			safetyNumberReady: boolean
			peerExchangeCompleted: boolean
		}
		video: {
			safetyNumberReady: boolean
			peerExchangeCompleted: boolean
		}
	}
	senderTransforms: TransformCoverage
	receiverTransforms: TransformCoverage
	strictReady: boolean
	coreReady: boolean
	lastError?: string
}

type MessagesToE2eeWorker =
	| {
			type: 'userJoined'
			id: string
	  }
	| {
			type: 'userLeft'
			id: string
	  }
	| { type: 'recvMlsMessage'; msg: Uint8Array }
	| { type: 'encryptStream'; in: ReadableStream; out: WritableStream }
	| { type: 'decryptStream'; in: ReadableStream; out: WritableStream }
	| { type: 'initializeAndCreateGroup'; id: string }

type MessagesFromE2eeWorker =
	| {
			type: 'workerReady'
	  }
	| {
			type: 'sendMlsMessage'
			msg: Uint8Array
	  }
	| {
			type: 'newSafetyNumber'
			msg: Uint8Array
	  }

export async function loadWorker(
	handleEvents: (message: MessagesFromE2eeWorker) => void
) {
	// Create a new worker
	const worker = new Worker(getE2eeWorkerUrl())

	const ready = new Promise<void>((res) => {
		const handler = (event: MessageEvent) => {
			if (event.data.type === 'workerReady') {
				res()
				worker.removeEventListener('message', handler)
			}
		}
		worker.addEventListener('message', handler)
	})

	// Listen for messages from the worker
	worker.onmessage = function (event: MessageEvent<MessagesFromE2eeWorker>) {
		console.log('Received message from worker:', event.data)
		handleEvents(event.data)
	}

	// Error handling
	worker.onerror = function (error) {
		console.error('Worker error:', error.message)
	}

	await ready

	async function safePostMessage(message: MessagesToE2eeWorker): Promise<void>
	async function safePostMessage(
		message: MessagesToE2eeWorker,
		transfer: Transferable[]
	): Promise<void>
	async function safePostMessage(
		message: MessagesToE2eeWorker,
		transfer?: Transferable[]
	): Promise<void> {
		if (transfer) {
			worker.postMessage(message, transfer)
		} else {
			worker.postMessage(message)
		}
	}

	return Object.assign(worker, {
		safePostMessage,
	})
}

type MessagesFromWorker =
	| { type: 'shareKeyPackage'; keyPkg: Uint8Array }
	| { type: 'sendMlsMessage'; msg: Uint8Array; senderId: string }
	| {
			type: 'sendMlsWelcome'
			senderId: string
			welcome: Uint8Array
			rtree: Uint8Array
	  }
	| { type: 'newSafetyNumber'; hash: Uint8Array }

const preferredVideoCodecOrder = [
	'VIDEO/H264',
	'VIDEO/VP8',
	'VIDEO/VP9',
	'VIDEO/H265',
	'VIDEO/HEVC',
] as const

export function sortVideoCodecPreferences(
	codecs: RTCRtpCodec[]
): RTCRtpCodec[] {
	const order: ReadonlyMap<string, number> = new Map<string, number>(
		preferredVideoCodecOrder.map((mimeType, index) => [mimeType, index] as const)
	)

	return [...codecs].sort((a, b) => {
		const aOrder = order.get(a.mimeType.toUpperCase()) ?? Number.MAX_SAFE_INTEGER
		const bOrder = order.get(b.mimeType.toUpperCase()) ?? Number.MAX_SAFE_INTEGER
		return aOrder - bOrder
	})
}

function getPreferredVideoCodecs(): RTCRtpCodec[] {
	if (
		typeof RTCRtpReceiver === 'undefined' ||
		typeof RTCRtpReceiver.getCapabilities !== 'function'
	) {
		return []
	}

	const supportedCodecs = RTCRtpReceiver.getCapabilities('video')?.codecs ?? []
	return sortVideoCodecPreferences(supportedCodecs)
}

export class EncryptionWorker {
	get worker(): Worker {
		invariant(
			this._worker !== null,
			'worker not yet initialized, call initialize() or initializeAndCreateGroup() first'
		)
		return this._worker
	}

	_worker: Worker | null = null
	_ready: Promise<void>
	safetyNumber: number = -1
	id: string

	constructor(config: { id: string }) {
		this.id = config.id
		this._worker = new Worker(getE2eeWorkerUrl())
		// Capture the workerReady message immediately so it is never missed,
		// regardless of how much later initialize() / initializeAndCreateGroup()
		// is called (e.g. after a debounce delay).
		this._ready = new Promise<void>((res) => {
			const handler = (event: MessageEvent) => {
				if (event.data.type === 'workerReady') {
					res()
					this._worker!.removeEventListener('message', handler)
				}
			}
			this._worker!.addEventListener('message', handler)
		})
	}

	dispose() {
		this.worker.terminate()
	}

	initialize(): Promise<void> {
		this.worker.postMessage({ type: 'initialize', id: this.id })
		return this._ready
	}

	initializeAndCreateGroup(): Promise<void> {
		this.worker.postMessage({ type: 'initializeAndCreateGroup', id: this.id })
		return this._ready
	}

	userJoined(keyPkg: Uint8Array) {
		this.worker.postMessage({ type: 'userJoined', keyPkg })
	}

	userLeft(id: string) {
		this.worker.postMessage({ type: 'userLeft', id })
	}

	receiveMlsWelcome(senderId: string, welcome: Uint8Array, rtree: Uint8Array) {
		this.worker.postMessage({
			type: 'recvMlsWelcome',
			welcome,
			rtree,
			senderId,
		})
	}

	receiveMlsMessage(msg: Uint8Array, senderId: string) {
		const message = {
			msg,
			senderId,
			type: 'recvMlsMessage',
		}
		console.log('passing receiveMlsMessage into worker', message)
		this.worker.postMessage(message)
	}

	async setupSenderTransform(sender: RTCRtpSender) {
		console.log('Setting up sender transform')

		// If this is Firefox, we will have to use RTCRtpScriptTransform
		if (window.RTCRtpScriptTransform) {
			sender.transform = new RTCRtpScriptTransform(this.worker, {
				operation: 'encryptStream',
			})
			return
		}

		// Otherwise if this is Chrome we'll have to use createEncodedStreams
		if (
			'createEncodedStreams' in sender &&
			typeof sender.createEncodedStreams === 'function'
		) {
			const senderStreams = sender.createEncodedStreams()
			const { readable, writable } = senderStreams
			this.worker.postMessage(
				{
					type: 'encryptStream',
					in: readable,
					out: writable,
				},
				[readable, writable]
			)

			return
		}

		throw new Error(
			'Neither RTCRtpScriptTransform nor RTCRtpSender.createEncodedStreams methods supported'
		)
	}

	async setupReceiverTransform(receiver: RTCRtpReceiver) {
		console.log('Setting up receiver transform')

		// If this is Firefox, we will have to use RTCRtpScriptTransform
		if (window.RTCRtpScriptTransform) {
			receiver.transform = new RTCRtpScriptTransform(this.worker, {
				operation: 'decryptStream',
			})

			return
		}

		// Otherwise if this is Chrome we'll have to use createEncodedStreams
		if (
			'createEncodedStreams' in receiver &&
			typeof receiver.createEncodedStreams === 'function'
		) {
			const senderStreams = receiver.createEncodedStreams()
			const { readable, writable } = senderStreams
			this.worker.postMessage(
				{
					type: 'decryptStream',
					in: readable,
					out: writable,
				},
				[readable, writable]
			)

			return
		}

		throw new Error(
			'Neither RTCRtpScriptTransform nor RTCRtpSender.createEncodedStreams methods supported'
		)
	}

	decryptStream(inStream: ReadableStream, outStream: WritableStream) {
		this.worker.postMessage({
			type: 'decryptStream',
			in: inStream,
			out: outStream,
		})
	}

	handleOutgoingEvents(onMessage: (data: string) => void) {
		this.worker.addEventListener('message', (event) => {
			const excludedEvents = ['workerReady', 'newSafetyNumber']
			if (!excludedEvents.includes(event.data.type)) {
				console.log('Message from worker in handleOutgoingEvents', event.data)
				onMessage(JSON.stringify(event.data, replacer))
			}
		})
	}

	handleIncomingEvent(data: string) {
		const message = JSON.parse(data, reviver) as MessagesFromWorker
		// the message type here came from another user's worker
		console.log('Incoming event: ', message.type, { message })
		switch (message.type) {
			case 'shareKeyPackage': {
				this.userJoined(message.keyPkg)
				break
			}
			case 'sendMlsWelcome': {
				this.receiveMlsWelcome(message.senderId, message.welcome, message.rtree)
				break
			}
			case 'sendMlsMessage': {
				this.receiveMlsMessage(message.msg, message.senderId)
				break
			}
		}
	}

	onNewSafetyNumber(handler: (safetyNumber: Uint8Array) => void) {
		this.worker.addEventListener('message', (event) => {
			if (event.data.type === 'newSafetyNumber') {
				handler(event.data.hash)
			}
		})
	}
}

const FLAG_TYPED_ARRAY = 'FLAG_TYPED_ARRAY'
const FLAG_ARRAY_BUFFER = 'FLAG_ARRAY_BUFFER'

function replacer(_key: string, value: any) {
	if (value instanceof Uint8Array) {
		return { [FLAG_TYPED_ARRAY]: true, data: Array.from(value) }
	}
	if (value instanceof ArrayBuffer) {
		return {
			[FLAG_ARRAY_BUFFER]: true,
			data: Array.from(new Uint8Array(value)),
		}
	}
	return value
}

function reviver(_key: string, value: any) {
	if (value && value[FLAG_TYPED_ARRAY]) {
		return Uint8Array.from(value.data)
	}
	if (value && value[FLAG_ARRAY_BUFFER]) {
		return new Uint8Array(value.data).buffer
	}
	return value
}

export function useE2EE({
	enabled = true,
	room,
	partyTracks,
}: {
	enabled?: boolean
	partyTracks: PartyTracks
	room: ReturnType<typeof useRoom>
}) {
	const [audioSafetyNumber, setAudioSafetyNumber] = useState<string>()
	const [videoSafetyNumber, setVideoSafetyNumber] = useState<string>()
	const [joined, setJoined] = useState(false)
	const [firstUser, setFirstUser] = useState(false)
	const [audioWorkerInitialized, setAudioWorkerInitialized] = useState(false)
	const [videoWorkerInitialized, setVideoWorkerInitialized] = useState(false)
	const workerInitialized = audioWorkerInitialized && videoWorkerInitialized
	const [peerExchangeParticipants, setPeerExchangeParticipants] = useState(0)
	const [audioPeerExchangeCompleted, setAudioPeerExchangeCompleted] =
		useState(false)
	const [videoPeerExchangeCompleted, setVideoPeerExchangeCompleted] =
		useState(false)
	const [lastError, setLastError] = useState<string>()
	const [senderKeys, setSenderKeys] = useState<Set<string>>(new Set())
	const [boundSenderKeys, setBoundSenderKeys] = useState<Set<string>>(new Set())
	const [receiverKeys, setReceiverKeys] = useState<Set<string>>(new Set())
	const [boundReceiverKeys, setBoundReceiverKeys] = useState<Set<string>>(
		new Set()
	)
	const [peerExchangeSenders, setPeerExchangeSenders] = useState<Set<string>>(
		new Set()
	)
	const senderTransformsBoundRef = useRef<WeakSet<RTCRtpSender>>(new WeakSet())
	const senderTransformsPendingRef = useRef<WeakSet<RTCRtpSender>>(new WeakSet())
	const receiverTransformsBoundRef = useRef<WeakSet<RTCRtpReceiver>>(new WeakSet())
	const receiverTransformsPendingRef = useRef<WeakSet<RTCRtpReceiver>>(
		new WeakSet()
	)
	const senderTransforms: TransformCoverage = {
		required: senderKeys.size,
		bound: boundSenderKeys.size,
	}
	const receiverTransforms: TransformCoverage = {
		required: receiverKeys.size,
		bound: boundReceiverKeys.size,
	}

	const peerExchangeRequired = hasOtherConnectedUsers(
		room.roomState.users,
		room.websocket.id
	)
	const safetyNumberReady = Boolean(audioSafetyNumber && videoSafetyNumber)
	const peerExchangeCompleted = peerExchangeRequired
		? audioPeerExchangeCompleted && videoPeerExchangeCompleted
		: true
	const transformsReady =
		senderTransforms.required === senderTransforms.bound &&
		receiverTransforms.required === receiverTransforms.bound

	const coreReady = enabled
		? joined &&
			workerInitialized &&
			// Safety number only required when peers are present (verifies the shared group key)
			(safetyNumberReady || !peerExchangeRequired) &&
			!lastError
		: true

	const strictReady = enabled
		? coreReady && transformsReady && (!peerExchangeRequired || peerExchangeCompleted)
		: true

	const e2eeStatus: E2EEVerificationStatus = {
		enabled,
		joined,
		workerInitialized,
		safetyNumberReady,
		peerExchangeRequired,
		peerExchangeCompleted,
		peerExchangeParticipants,
		mediaReadiness: {
			audio: {
				safetyNumberReady: Boolean(audioSafetyNumber),
				peerExchangeCompleted: audioPeerExchangeCompleted,
			},
			video: {
				safetyNumberReady: Boolean(videoSafetyNumber),
				peerExchangeCompleted: videoPeerExchangeCompleted,
			},
		},
		senderTransforms,
		receiverTransforms,
		strictReady,
		coreReady,
		lastError,
	}

	const audioWorker = useMemo(
		() =>
			enabled
				? new EncryptionWorker({
						id: `${room.websocket.id}-audio`,
					})
				: null,
		[enabled, room.websocket.id, room.roomState.meetingId]
	)

	const videoWorker = useMemo(
		() =>
			enabled
				? new EncryptionWorker({
						id: `${room.websocket.id}-video`,
					})
				: null,
		[enabled, room.websocket.id, room.roomState.meetingId]
	)

	const getTransceiverKey = useCallback(
		(transceiver: RTCRtpTransceiver, role: 'sender' | 'receiver') => {
			if (transceiver.mid) return `${role}:mid:${transceiver.mid}`
			const trackId =
				role === 'sender'
					? transceiver.sender.track?.id
					: transceiver.receiver.track?.id
			if (trackId) return `${role}:track:${trackId}`
			return undefined
		},
		[]
	)

	const registerRequiredKey = useCallback(
		(role: 'sender' | 'receiver', key?: string) => {
			if (!key) return
			if (role === 'sender') {
				setSenderKeys((prev) => {
					if (prev.has(key)) return prev
					const next = new Set(prev)
					next.add(key)
					return next
				})
				return
			}
			setReceiverKeys((prev) => {
				if (prev.has(key)) return prev
				const next = new Set(prev)
				next.add(key)
				return next
			})
		},
		[]
	)

	const registerBoundKey = useCallback(
		(role: 'sender' | 'receiver', key?: string) => {
			if (!key) return
			if (role === 'sender') {
				setBoundSenderKeys((prev) => {
					if (prev.has(key)) return prev
					const next = new Set(prev)
					next.add(key)
					return next
				})
				return
			}
			setBoundReceiverKeys((prev) => {
				if (prev.has(key)) return prev
				const next = new Set(prev)
				next.add(key)
				return next
			})
		},
		[]
	)

	const resetVerificationState = useCallback(() => {
		setAudioSafetyNumber(undefined)
		setVideoSafetyNumber(undefined)
		setAudioWorkerInitialized(false)
		setVideoWorkerInitialized(false)
		setLastError(undefined)
		setPeerExchangeParticipants(0)
		setAudioPeerExchangeCompleted(false)
		setVideoPeerExchangeCompleted(false)
		setSenderKeys(new Set())
		setBoundSenderKeys(new Set())
		setReceiverKeys(new Set())
		setBoundReceiverKeys(new Set())
		setPeerExchangeSenders(new Set())
		senderTransformsBoundRef.current = new WeakSet()
		senderTransformsPendingRef.current = new WeakSet()
		receiverTransformsBoundRef.current = new WeakSet()
		receiverTransformsPendingRef.current = new WeakSet()
	}, [])

	useEffect(() => {
		if (!audioWorker || !videoWorker) return
		return () => {
			audioWorker.dispose()
			videoWorker.dispose()
		}
	}, [audioWorker, videoWorker])

	useEffect(() => {
		if (!enabled || !joined || !audioWorker || !videoWorker) return

		const subscription = partyTracks.transceiver$.subscribe((transceiver) => {
			console.log('[E2EE] Sender transceiver check:', {
				direction: transceiver.direction,
				currentDirection: transceiver.currentDirection,
				kind: transceiver.sender.track?.kind,
				mid: transceiver.mid
			})
			
			if (!transceiver.sender || !transceiver.sender.track) return

			const kind = transceiver.sender.track.kind
			if (kind !== 'audio' && kind !== 'video') return
			const senderKey = getTransceiverKey(transceiver, 'sender')
			const worker = kind === 'audio' ? audioWorker : videoWorker

			registerRequiredKey('sender', senderKey)

			if (kind === 'video') {
				const preferredCodecs = getPreferredVideoCodecs()

				if (preferredCodecs.length > 0) {
					try {
						transceiver.setCodecPreferences(preferredCodecs)
					} catch (error) {
						console.warn('[E2EE] Failed to set video codec preferences', error)
					}
				}
			}

			if (senderTransformsBoundRef.current.has(transceiver.sender)) return
			if (senderTransformsPendingRef.current.has(transceiver.sender)) return
			senderTransformsPendingRef.current.add(transceiver.sender)

			worker
				.setupSenderTransform(transceiver.sender)
				.then(() => {
					senderTransformsPendingRef.current.delete(transceiver.sender)
					senderTransformsBoundRef.current.add(transceiver.sender)
					registerBoundKey('sender', senderKey)
				})
				.catch((error) => {
					senderTransformsPendingRef.current.delete(transceiver.sender)
					setLastError(
						(error as Error)?.message || `Failed to bind ${kind} sender transform`
					)
				})
		})

		return () => {
			subscription.unsubscribe()
		}
	}, [
		enabled,
		joined,
		audioWorker,
		videoWorker,
		partyTracks.transceiver$,
		getTransceiverKey,
		registerRequiredKey,
		registerBoundKey,
	])

	useEffect(() => {
		if (!enabled || !joined || !audioWorker || !videoWorker) {
			console.log('[E2EE] Receiver transform effect skipped:', { enabled, joined, hasAudioWorker: !!audioWorker, hasVideoWorker: !!videoWorker })
			return
		}
		console.log('[E2EE] Receiver transform subscription active')
		const subscription = partyTracks.transceiver$.subscribe((transceiver) => {
			console.log('[E2EE] Receiver transceiver check:', {
				direction: transceiver.direction,
				currentDirection: transceiver.currentDirection,
				kind: transceiver.receiver.track?.kind,
				mid: transceiver.mid
			})
			
			// We want to handle any receiver that might produce data.
			// Safari might have quirky direction states initially, so if the receiver exists, attach it.
			if (!transceiver.receiver || !transceiver.receiver.track) return

			const kind = transceiver.receiver.track.kind
			if (kind !== 'audio' && kind !== 'video') return
			const receiverKey = getTransceiverKey(transceiver, 'receiver')
			const worker = kind === 'audio' ? audioWorker : videoWorker

			registerRequiredKey('receiver', receiverKey)

			if (receiverTransformsBoundRef.current.has(transceiver.receiver)) {
				console.log(`[E2EE] Receiver ${kind} transform already bound, skipping`)
				return
			}
			if (receiverTransformsPendingRef.current.has(transceiver.receiver)) {
				console.log(`[E2EE] Receiver ${kind} transform already pending, skipping`)
				return
			}
			receiverTransformsPendingRef.current.add(transceiver.receiver)
			console.log(`[E2EE] Binding receiver ${kind} transform...`)

			worker
				.setupReceiverTransform(transceiver.receiver)
				.then(() => {
					receiverTransformsPendingRef.current.delete(transceiver.receiver)
					receiverTransformsBoundRef.current.add(transceiver.receiver)
					registerBoundKey('receiver', receiverKey)
					console.log(`[E2EE] Receiver ${kind} transform bound successfully`)
				})
				.catch((error) => {
					receiverTransformsPendingRef.current.delete(transceiver.receiver)
					console.error(`[E2EE] Receiver ${kind} transform bind failed:`, error)
					setLastError(
						(error as Error)?.message ||
							`Failed to bind ${kind} receiver transform`
					)
				})
		})

		return () => {
			subscription.unsubscribe()
		}
	}, [
		enabled,
		joined,
		audioWorker,
		videoWorker,
		partyTracks.transceiver$,
		getTransceiverKey,
		registerRequiredKey,
		registerBoundKey,
	])

	const onJoin = useCallback(
		(firstUser: boolean) => {
			if (!enabled) return
			if (joined) return
			resetVerificationState()
			setJoined(true)
			setFirstUser(firstUser)
		},
		[enabled, joined, resetVerificationState]
	)

	useEffect(() => {
		if (!joined || !audioWorker || !videoWorker) return

		const setupWorker = (worker: EncryptionWorker, type: 'audio' | 'video') => {
			worker.onNewSafetyNumber((buffer) => {
				const nextSafetyNumber = arrayBufferToDecimal(
					buffer as unknown as ArrayBuffer
				)
				if (type === 'audio') {
					setAudioSafetyNumber((prev) => {
						if (prev === nextSafetyNumber) return prev
						return nextSafetyNumber
					})
				} else {
					setVideoSafetyNumber((prev) => {
						if (prev === nextSafetyNumber) return prev
						return nextSafetyNumber
					})
				}
			})
			worker.handleOutgoingEvents((data) => {
				room.websocket.send(
					JSON.stringify({
						type: 'e2eeMlsMessage',
						mediaType: type,
						payload: data,
					})
				)
			})
		}

		setupWorker(audioWorker, 'audio')
		setupWorker(videoWorker, 'video')

		const handler = (event: MessageEvent) => {
			const message = JSON.parse(event.data)
			if (message.type === 'e2eeMlsMessage') {
				const mediaType = message.mediaType as 'audio' | 'video' | undefined
				try {
					const payload = JSON.parse(message.payload) as { senderId?: string }
					if (payload.senderId) {
						setPeerExchangeSenders((prev) => {
							if (prev.has(payload.senderId!)) return prev
							const next = new Set(prev)
							next.add(payload.senderId!)
							setPeerExchangeParticipants(next.size)
							return next
						})
					}
				} catch {
					if (peerExchangeParticipants === 0) {
						setPeerExchangeParticipants(1)
					}
				}
				if (mediaType === 'audio') {
					setAudioPeerExchangeCompleted(true)
					audioWorker.handleIncomingEvent(message.payload)
				} else if (mediaType === 'video') {
					setVideoPeerExchangeCompleted(true)
					videoWorker.handleIncomingEvent(message.payload)
				} else {
					// Backward compatibility: old relays/clients may omit mediaType.
					// Feed both workers so MLS handshakes can still converge.
					setAudioPeerExchangeCompleted(true)
					setVideoPeerExchangeCompleted(true)
					audioWorker.handleIncomingEvent(message.payload)
					videoWorker.handleIncomingEvent(message.payload)
				}
			}
			if (message.type === 'userLeftNotification') {
				audioWorker.userLeft(`${message.id}-audio`)
				videoWorker.userLeft(`${message.id}-video`)
			}
		}

		room.websocket.addEventListener('message', handler)

		if (firstUser) {
			Promise.all([
				audioWorker.initializeAndCreateGroup(),
				videoWorker.initializeAndCreateGroup(),
			]).then(() => {
				setAudioWorkerInitialized(true)
				setVideoWorkerInitialized(true)
				room.websocket.send(
					JSON.stringify({
						type: 'setE2eeGroupEstablished',
					} satisfies ClientMessage)
				)
			})
		} else {
			Promise.all([audioWorker.initialize(), videoWorker.initialize()]).then(
				() => {
					setAudioWorkerInitialized(true)
					setVideoWorkerInitialized(true)
				}
			)
		}

		return () => {
			room.websocket.removeEventListener('message', handler)
		}
	}, [audioWorker, videoWorker, firstUser, joined, room.websocket])

	useEffect(() => {
		if (!enabled) return
		console.log('[E2EE] coreReady changed:', coreReady, {
			joined,
			workerInitialized,
			audioSafetyNumber: !!audioSafetyNumber,
			videoSafetyNumber: !!videoSafetyNumber,
			safetyNumberReady,
			peerExchangeRequired,
		})
	}, [coreReady, enabled, joined, workerInitialized, audioSafetyNumber, videoSafetyNumber, safetyNumberReady, peerExchangeRequired])

	return {
		e2eeSafetyNumber: enabled
			? audioSafetyNumber && videoSafetyNumber
				? `${audioSafetyNumber}-${videoSafetyNumber}`
				: audioSafetyNumber || videoSafetyNumber
			: undefined,
		e2eeStatus,
		onJoin,
	}
}

function arrayBufferToDecimal(buffer: ArrayBuffer) {
	const byteArray = new Uint8Array(buffer) // Create a typed array from the ArrayBuffer
	const hexArray = Array.from(byteArray, (byte) => {
		return byte.toString(10).padStart(2, '0') // Convert each byte to a 2-digit hex string
	})
	return hexArray.join('') // Join all hex strings into a single string
}
