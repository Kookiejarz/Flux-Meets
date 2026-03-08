import type { PartyTracks } from 'partytracks/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import invariant from 'tiny-invariant'
import type useRoom from '~/hooks/useRoom'
import { RELEASE } from '~/utils/constants'
import type { ServerMessage } from '~/types/Messages'

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
	| { type: 'encryptStream'; kind: string; in: ReadableStream; out: WritableStream }
	| { type: 'decryptStream'; kind: string; in: ReadableStream; out: WritableStream }
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

export class EncryptionWorker {
	get worker(): Worker {
		invariant(
			this._worker !== null,
			'worker not yet initialized, call initialize() or initializeAndCreateGroup() first'
		)
		return this._worker
	}

	_worker: Worker | null = null
	safetyNumber: number = -1
	id: string

	constructor(config: { id: string }) {
		this.id = config.id
		this._worker = new Worker(getE2eeWorkerUrl())
	}

	dispose() {
		this.worker.terminate()
	}

	initialize() {
		this.worker.postMessage({ type: 'initialize', id: this.id })
	}

	initializeAndCreateGroup() {
		this.worker.postMessage({ type: 'initializeAndCreateGroup', id: this.id })
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

	async setupSenderTransform(sender: RTCRtpSender, kind: string) {
		console.log('Setting up sender transform')

		// If this is Firefox, we will have to use RTCRtpScriptTransform
		if (window.RTCRtpScriptTransform) {
			sender.transform = new RTCRtpScriptTransform(this.worker, {
				operation: 'encryptStream',
				kind,
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
					kind,
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

	async setupReceiverTransform(receiver: RTCRtpReceiver, kind: string) {
		console.log('Setting up receiver transform')

		// If this is Firefox, we will have to use RTCRtpScriptTransform
		if (window.RTCRtpScriptTransform) {
			receiver.transform = new RTCRtpScriptTransform(this.worker, {
				operation: 'decryptStream',
				kind,
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
					kind,
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
	enabled = false,
	room,
	partyTracks,
}: {
	enabled?: boolean
	partyTracks: PartyTracks
	room: ReturnType<typeof useRoom>
}) {
	const [safetyNumber, setSafetyNumber] = useState<string>()
	const [joined, setJoined] = useState(false)
	const [firstUser, setFirstUser] = useState(false)
	const [audioWorkerInitialized, setAudioWorkerInitialized] = useState(false)
	const [videoWorkerInitialized, setVideoWorkerInitialized] = useState(false)
	const workerInitialized = audioWorkerInitialized && videoWorkerInitialized
	const [peerExchangeParticipants, setPeerExchangeParticipants] = useState(0)
	const [peerExchangeCompleted, setPeerExchangeCompleted] = useState(false)
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
	const senderTransforms: TransformCoverage = {
		required: senderKeys.size,
		bound: boundSenderKeys.size,
	}
	const receiverTransforms: TransformCoverage = {
		required: receiverKeys.size,
		bound: boundReceiverKeys.size,
	}

	const peerExchangeRequired = room.otherUsers.length > 0
	const safetyNumberReady = Boolean(safetyNumber)
	const transformsReady =
		senderTransforms.required === senderTransforms.bound &&
		receiverTransforms.required === receiverTransforms.bound

	const coreReady = enabled
		? joined &&
			workerInitialized &&
			safetyNumberReady &&
			(!peerExchangeRequired || peerExchangeCompleted) &&
			!lastError
		: true

	const strictReady = enabled
		? coreReady && transformsReady
		: true

	const e2eeStatus: E2EEVerificationStatus = {
		enabled,
		joined,
		workerInitialized,
		safetyNumberReady,
		peerExchangeRequired,
		peerExchangeCompleted,
		peerExchangeParticipants,
		senderTransforms,
		receiverTransforms,
		strictReady,
		coreReady,
		lastError,
	}

	const audioWorker = useMemo(
		() =>
			new EncryptionWorker({
				id: `${room.websocket.id}-audio`,
			}),
		[room.websocket.id]
	)

	const videoWorker = useMemo(
		() =>
			new EncryptionWorker({
				id: `${room.websocket.id}-video`,
			}),
		[room.websocket.id]
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
		setSafetyNumber(undefined)
		setAudioWorkerInitialized(false)
		setVideoWorkerInitialized(false)
		setLastError(undefined)
		setPeerExchangeParticipants(0)
		setPeerExchangeCompleted(false)
		setSenderKeys(new Set())
		setBoundSenderKeys(new Set())
		setReceiverKeys(new Set())
		setBoundReceiverKeys(new Set())
		setPeerExchangeSenders(new Set())
	}, [])

	useEffect(() => {
		return () => {
			audioWorker.dispose()
			videoWorker.dispose()
		}
	}, [audioWorker, videoWorker])

	useEffect(() => {
		if (!enabled || !joined) return

		const subscription = partyTracks.transceiver$.subscribe((transceiver) => {
			const shouldHandleSender =
				transceiver.direction === 'sendonly' ||
				transceiver.direction === 'sendrecv'
			if (!shouldHandleSender) return

			const senderKey = getTransceiverKey(transceiver, 'sender')
			const kind = transceiver.sender.track?.kind
			const worker = kind === 'audio' ? audioWorker : videoWorker

			registerRequiredKey('sender', senderKey)

			if (kind === 'video') {
				const capability = RTCRtpSender.getCapabilities('video')
				const codecs = capability ? capability.codecs : []

				const getMime = (codec: (typeof codecs)[number]) =>
					codec.mimeType.toUpperCase()
				const isRtx = (codec: (typeof codecs)[number]) =>
					getMime(codec) === 'VIDEO/RTX'
				const isH265 = (codec: (typeof codecs)[number]) => {
					const mime = getMime(codec)
					return mime === 'VIDEO/H265' || mime === 'VIDEO/HEVC'
				}
				const isH264 = (codec: (typeof codecs)[number]) =>
					getMime(codec) === 'VIDEO/H264'
				const isVp8 = (codec: (typeof codecs)[number]) =>
					getMime(codec) === 'VIDEO/VP8'
				const isVp9 = (codec: (typeof codecs)[number]) =>
					getMime(codec) === 'VIDEO/VP9'

				const h265Codecs = codecs.filter(isH265)
				const h264Codecs = codecs.filter(isH264)
				const vp8Codecs = codecs.filter(isVp8)
				const vp9Codecs = codecs.filter(isVp9)
				const rtxCodecs = codecs.filter(isRtx)

				const preferredCodecs = [
					...h265Codecs,
					...h264Codecs,
					...vp8Codecs,
					...vp9Codecs,
					...rtxCodecs,
				]

				if (preferredCodecs.length > 0) {
					transceiver.setCodecPreferences(preferredCodecs)
				}
			}

			if (senderKey && boundSenderKeys.has(senderKey)) return

			worker
				.setupSenderTransform(transceiver.sender, kind ?? 'unknown')
				.then(() => {
					registerBoundKey('sender', senderKey)
				})
				.catch((error) => {
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
		boundSenderKeys,
	])

	useEffect(() => {
		if (!enabled || !joined) return
		const subscription = partyTracks.transceiver$.subscribe((transceiver) => {
			const shouldHandleReceiver =
				transceiver.direction === 'recvonly' ||
				transceiver.direction === 'sendrecv'
			if (!shouldHandleReceiver) return

			const receiverKey = getTransceiverKey(transceiver, 'receiver')
			const kind = transceiver.receiver.track?.kind
			const worker = kind === 'audio' ? audioWorker : videoWorker

			registerRequiredKey('receiver', receiverKey)

			if (receiverKey && boundReceiverKeys.has(receiverKey)) return

			worker
				.setupReceiverTransform(transceiver.receiver, kind ?? 'unknown')
				.then(() => {
					registerBoundKey('receiver', receiverKey)
				})
				.catch((error) => {
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
		boundReceiverKeys,
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
		if (!joined) return

		const setupWorker = (worker: EncryptionWorker, type: 'audio' | 'video') => {
			worker.onNewSafetyNumber((buffer) => {
				setSafetyNumber((prev) => {
					if (prev) return prev
					return arrayBufferToDecimal(buffer as unknown as ArrayBuffer)
				})
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
				setPeerExchangeCompleted(true)
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
					audioWorker.handleIncomingEvent(message.payload)
				} else if (mediaType === 'video') {
					videoWorker.handleIncomingEvent(message.payload)
				} else {
					// Backward compatibility: old relays/clients may omit mediaType.
					// Feed both workers so MLS handshakes can still converge.
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
			audioWorker.initializeAndCreateGroup()
			videoWorker.initializeAndCreateGroup()
		} else {
			audioWorker.initialize()
			videoWorker.initialize()
		}
		setAudioWorkerInitialized(true)
		setVideoWorkerInitialized(true)

		return () => {
			room.websocket.removeEventListener('message', handler)
		}
	}, [
		audioWorker,
		videoWorker,
		firstUser,
		joined,
		room.websocket,
		peerExchangeParticipants,
	])

	return {
		e2eeSafetyNumber: enabled ? safetyNumber : undefined,
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
