import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocalStorage } from 'react-use'
import type { Observable, Subscription } from 'rxjs'
import { BehaviorSubject, filter } from 'rxjs'
import blurVideoTrack from '~/utils/blurVideoTrack'
import noiseSuppression from '~/utils/noiseSuppression'

export const errorMessageMap = {
	NotAllowedError:
		'Permission was denied. Grant permission and reload to enable.',
	NotFoundError: 'No device was found.',
	NotReadableError: 'Device is already in use.',
	OverconstrainedError: 'No device was found that meets constraints.',
	DevicesExhaustedError: 'All devices failed to initialize.',
	UnknownError: 'An unknown error occurred.',
}

type UserMediaError = keyof typeof errorMessageMap

// Simple reactive helper compatible with useObservableAsValue
function createBehaviorSubject<T>(initial: T) {
	const subject = new BehaviorSubject<T>(initial)
	return subject
}

function useSubjectValue<T>(subject: BehaviorSubject<T>) {
	const [value, setValue] = useState(subject.value)
	useEffect(() => {
		const sub = subject.subscribe((v) => setValue(v))
		return () => sub.unsubscribe()
	}, [subject])
	return value
}

type TransformFn = (track: MediaStreamTrack) => Observable<MediaStreamTrack>

type MediaDeviceKind = 'audio' | 'video'

function getAudioConstraints(): MediaTrackConstraints {
	return {
		echoCancellation: true,
		// 浏览器内置降噪关闭，避免与 rnnoise worklet 双重处理
		// 如需降噪，通过设置面板的 suppress-noise 开关启用 rnnoise
		noiseSuppression: false,
		autoGainControl: true,
	}
}

function isMobileDevice() {
	if (typeof window === 'undefined') return false
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
		navigator.userAgent
	)
}

function getVideoConstraints(): MediaTrackConstraints {
	const base: MediaTrackConstraints = { facingMode: 'user' }
	if (isMobileDevice()) {
		base.width = { ideal: 640, max: 1280 }
		base.height = { ideal: 480, max: 720 }
	} else {
		base.width = { ideal: 1280 }
		base.height = { ideal: 720 }
	}
	return base
}

class NativeMediaDevice {
	private kind: MediaDeviceKind
	private constraints: MediaTrackConstraints
	private preferredDeviceId?: string
	private transforms = new Set<TransformFn>()
	private transformSubscriptions: Subscription[] = []
	private currentTrack: MediaStreamTrack | null = null
	private originalTrack: MediaStreamTrack | null = null
	private currentFacingMode: 'user' | 'environment' = 'user'

	readonly isBroadcasting$ = createBehaviorSubject<boolean>(false)
	readonly broadcastTrack$ = createBehaviorSubject<
		MediaStreamTrack | undefined
	>(undefined)
	readonly localMonitorTrack$ = createBehaviorSubject<
		MediaStreamTrack | undefined
	>(undefined)
	readonly devices$ = createBehaviorSubject<MediaDeviceInfo[]>([])
	readonly activeDevice$ = createBehaviorSubject<MediaDeviceInfo | null>(null)
	readonly error$ = createBehaviorSubject<Error | DOMException | null>(null)

	constructor(kind: MediaDeviceKind, constraints: MediaTrackConstraints) {
		this.kind = kind
		this.constraints = constraints
	}

	async toggleCameraFacing() {
		if (this.kind !== 'video') return
		if (!isMobileDevice()) return

		this.currentFacingMode =
			this.currentFacingMode === 'user' ? 'environment' : 'user'
		this.constraints.facingMode = this.currentFacingMode

		// Restart broadcasting with new facing mode
		if (this.isBroadcasting$.value) {
			await this.startBroadcasting()
		}
	}

	setPreferredDevice(device: MediaDeviceInfo) {
		this.preferredDeviceId = device.deviceId
		this.activeDevice$.next(device)
	}

	addTransform(fn: TransformFn) {
		this.transforms.add(fn)
	}

	removeTransform(fn: TransformFn) {
		this.transforms.delete(fn)
	}

	async enumerateDevices() {
		if (!navigator.mediaDevices?.enumerateDevices) return
		const all = await navigator.mediaDevices.enumerateDevices()
		const filtered = all.filter((d) =>
			this.kind === 'audio' ? d.kind === 'audioinput' : d.kind === 'videoinput'
		)
		this.devices$.next(filtered)
		if (!this.activeDevice$.value && filtered[0]) {
			this.activeDevice$.next(filtered[0])
		}
	}

	private stopCurrentTrack() {
		this.transformSubscriptions.forEach((s) => s.unsubscribe())
		this.transformSubscriptions = []
		if (this.currentTrack) {
			console.log(`🛑 Stopping ${this.kind} track (processed)`)
			this.currentTrack.stop()
			this.currentTrack = null
		}
		if (this.originalTrack) {
			console.log(`🛑 Stopping ${this.kind} track (original)`)
			this.originalTrack.stop()
			this.originalTrack = null
		}
		this.broadcastTrack$.next(undefined)
		this.localMonitorTrack$.next(undefined)
		this.isBroadcasting$.next(false)
	}

	async startBroadcasting() {
		if (!navigator.mediaDevices?.getUserMedia) return
		this.stopCurrentTrack()
		try {
			const baseConstraints: MediaStreamConstraints = {
				audio: this.kind === 'audio' ? { ...getAudioConstraints() } : false,
				video: this.kind === 'video' ? { ...getVideoConstraints() } : false,
			}

			if (
				this.kind === 'audio' &&
				baseConstraints.audio &&
				this.preferredDeviceId
			) {
				;(baseConstraints.audio as MediaTrackConstraints).deviceId = {
					exact: this.preferredDeviceId,
				}
			}
			if (
				this.kind === 'video' &&
				baseConstraints.video &&
				this.preferredDeviceId
			) {
				;(baseConstraints.video as MediaTrackConstraints).deviceId = {
					exact: this.preferredDeviceId,
				}
			}

			const stream = await navigator.mediaDevices.getUserMedia(baseConstraints)
			const track =
				this.kind === 'audio'
					? stream.getAudioTracks()[0]
					: stream.getVideoTracks()[0]
			if (!track) throw new Error('No track returned from getUserMedia')

			// Update active device from settings if available
			const settingsId = track.getSettings().deviceId
			const device = this.devices$.value.find((d) => d.deviceId === settingsId)
			if (device) this.activeDevice$.next(device)

			// Save original track reference
			this.originalTrack = track

			let processedTrack: MediaStreamTrack = track

			// Apply transforms sequentially
			for (const transform of this.transforms) {
				const sub = transform(processedTrack).subscribe({
					// eslint-disable-next-line no-loop-func
					next: (t) => {
						processedTrack = t
					},
					complete: () => undefined,
					error: (err) => console.error('Transform error', err),
				})
				this.transformSubscriptions.push(sub)
			}

			this.currentTrack = processedTrack
			this.broadcastTrack$.next(processedTrack)
			// localMonitorTrack 始终使用原始未处理的轨道
			// 这样本地音量指示器等不受 transform 管线影响
			this.localMonitorTrack$.next(track)
			this.isBroadcasting$.next(true)
			this.error$.next(null)
		} catch (err: any) {
			this.error$.next(err)
			this.isBroadcasting$.next(false)
			throw err
		}
	}

	stopBroadcasting = () => {
		this.stopCurrentTrack()
	}

	mute = () => {
		if (!this.currentTrack) {
			this.broadcastTrack$.next(undefined)
			this.localMonitorTrack$.next(undefined)
			this.isBroadcasting$.next(false)
			return
		}
		// Disable the track to stop capturing audio from the microphone
		this.currentTrack.enabled = false
		if (this.originalTrack) {
			this.originalTrack.enabled = false
		}
		this.broadcastTrack$.next(undefined)
		this.isBroadcasting$.next(false)
	}

	unmute = async () => {
		if (this.currentTrack) {
			// Re-enable the track to resume capturing audio
			this.currentTrack.enabled = true
			if (this.originalTrack) {
				this.originalTrack.enabled = true
			}
			this.broadcastTrack$.next(this.currentTrack)
			this.isBroadcasting$.next(true)
			return
		}
		return this.startBroadcasting()
	}
}

class NativeScreenshare {
	readonly video = {
		isBroadcasting$: createBehaviorSubject<boolean>(false),
		broadcastTrack$: createBehaviorSubject<MediaStreamTrack | undefined>(
			undefined
		),
	}

	async startBroadcasting() {
		if (!navigator.mediaDevices?.getDisplayMedia) return
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: false,
			})
			const track = stream.getVideoTracks()[0]
			if (!track) throw new Error('No screenshare track')
			this.video.broadcastTrack$.next(track)
			this.video.isBroadcasting$.next(true)
		} catch (err) {
			this.video.broadcastTrack$.next(undefined)
			this.video.isBroadcasting$.next(false)
			throw err
		}
	}

	stopBroadcasting() {
		const track = this.video.broadcastTrack$.value
		if (track) track.stop()
		this.video.broadcastTrack$.next(undefined)
		this.video.isBroadcasting$.next(false)
	}
}

// Singletons to mimic previous exports
export const mic = new NativeMediaDevice('audio', getAudioConstraints())
export const camera = new NativeMediaDevice('video', getVideoConstraints())
export const screenshare = new NativeScreenshare()

function useNoiseSuppression() {
	// 默认关闭 rnnoise worklet 降噪，避免 AudioContext 管线引入延迟和音质损失
	// 用户可在设置中手动开启（适合嘈杂环境/外放场景）
	const [suppressNoise, setSuppressNoise] = useLocalStorage(
		'suppress-noise',
		false
	)
	useEffect(() => {
		if (suppressNoise) mic.addTransform(noiseSuppression)
		return () => {
			mic.removeTransform(noiseSuppression)
		}
	}, [suppressNoise])

	return [suppressNoise, setSuppressNoise] as const
}

function useBlurVideo() {
	const [blurVideo, setBlurVideo] = useLocalStorage('blur-video', false)
	useEffect(() => {
		if (blurVideo) camera.addTransform(blurVideoTrack)
		return () => {
			camera.removeTransform(blurVideoTrack)
		}
	}, [blurVideo])

	return [blurVideo, setBlurVideo] as const
}

function useScreenshare() {
	const startScreenShare = useCallback(() => {
		screenshare.startBroadcasting()
	}, [])
	const endScreenShare = useCallback(() => {
		screenshare.stopBroadcasting()
	}, [])

	return {
		startScreenShare,
		endScreenShare,
		screenShareVideoTrack$: screenshare.video.broadcastTrack$,
		screenShareVideoTrack: screenshare.video.broadcastTrack$.value,
	}
}

export default function useUserMedia(options: {
	micDeviceId?: string
	cameraDeviceId?: string
}) {
	useEffect(() => {
		return () => {
			// Ensure hardware is released when leaving the room
			mic.stopBroadcasting()
			camera.stopBroadcasting()
			screenshare.stopBroadcasting()
		}
	}, [])

	useEffect(() => {
		if (typeof window === 'undefined' || !navigator.mediaDevices) return
		mic
			.enumerateDevices()
			.catch((err) => console.error('Failed to enumerate mic devices:', err))
	}, [])

	useEffect(() => {
		if (typeof window === 'undefined' || !navigator.mediaDevices) return
		camera
			.enumerateDevices()
			.catch((err) => console.error('Failed to enumerate camera devices:', err))
	}, [])

	useEffect(() => {
		if (options.micDeviceId) {
			const found = mic.devices$.value.find(
				(d) => d.deviceId === options.micDeviceId
			)
			if (found) mic.setPreferredDevice(found)
		}
	}, [options.micDeviceId])

	useEffect(() => {
		if (options.cameraDeviceId) {
			const found = camera.devices$.value.find(
				(d) => d.deviceId === options.cameraDeviceId
			)
			if (found) camera.setPreferredDevice(found)
		}
	}, [options.cameraDeviceId])

	const [suppressNoise, setSuppressNoise] = useNoiseSuppression()
	const [blurVideo, setBlurVideo] = useBlurVideo()

	const [videoUnavailableReason, setVideoUnavailableReason] =
		useState<UserMediaError>()
	const [audioUnavailableReason, setAudioUnavailableReason] =
		useState<UserMediaError>()

	const { endScreenShare, startScreenShare, screenShareVideoTrack$ } =
		useScreenshare()

	useEffect(() => {
		const sub = mic.broadcastTrack$.subscribe((t) => {
			if (t) setAudioUnavailableReason(undefined)
		})
		return () => sub.unsubscribe()
	}, [])

	useEffect(() => {
		const sub = camera.broadcastTrack$.subscribe((t) => {
			if (t) setVideoUnavailableReason(undefined)
		})
		return () => sub.unsubscribe()
	}, [])

	useEffect(() => {
		const sub = mic.error$.subscribe((e) => {
			if (!e) return
			console.error('🔴 Mic error:', {
				name: (e as any).name,
				message: (e as any).message,
			})
			const reason =
				(e as any).name in errorMessageMap
					? ((e as any).name as UserMediaError)
					: 'UnknownError'
			setAudioUnavailableReason(reason)
			mic.stopBroadcasting()
		})
		return () => sub.unsubscribe()
	}, [])

	useEffect(() => {
		const sub = camera.error$.subscribe((e) => {
			if (!e) return
			console.error('🔴 Camera error:', {
				name: (e as any).name,
				message: (e as any).message,
			})
			const reason =
				(e as any).name in errorMessageMap
					? ((e as any).name as UserMediaError)
					: 'UnknownError'
			setVideoUnavailableReason(reason)
			camera.stopBroadcasting()
		})
		return () => sub.unsubscribe()
	}, [])

	// Auto-start when permission already granted
	useEffect(() => {
		let cancelled = false
		const run = async () => {
			try {
				const perm = await navigator.permissions?.query({
					name: 'microphone' as any,
				})
				if (perm?.state === 'granted' && !cancelled) {
					console.log('Permission already granted, auto-starting mic/camera')
					setTimeout(() => {
						mic.startBroadcasting().catch(() => {})
						camera.startBroadcasting().catch(() => {})
					}, 500)
				}
			} catch {
				// ignore
			}
		}
		run()
		return () => {
			cancelled = true
		}
	}, [])

	const turnMicOn = useCallback(() => {
		setAudioUnavailableReason(undefined)
		mic.unmute().catch(() => {})
	}, [])

	const turnCameraOn = useCallback(() => {
		setVideoUnavailableReason(undefined)
		camera.startBroadcasting().catch(() => {})
	}, [])

	const audioStreamTrack = useSubjectValue(mic.broadcastTrack$)
	const audioMonitorStreamTrack = useSubjectValue(mic.localMonitorTrack$)
	const videoStreamTrack = useSubjectValue(camera.broadcastTrack$)
	const audioEnabled = useSubjectValue(mic.isBroadcasting$)
	const videoEnabled = useSubjectValue(camera.isBroadcasting$)
	const screenShareEnabled = useSubjectValue(screenshare.video.isBroadcasting$)
	const screenShareVideoTrack = useSubjectValue(
		screenshare.video.broadcastTrack$
	)

	// Non-null observables for partyTracks.push (screenshare keeps undefined to signal stop)
	const publicAudioTrack$ = mic.broadcastTrack$
	const privateAudioTrack$ = useMemo(
		() =>
			mic.localMonitorTrack$.pipe(
				filter((t): t is MediaStreamTrack => Boolean(t))
			),
		[]
	)
	const videoTrack$ = useMemo(
		() =>
			camera.broadcastTrack$.pipe(
				filter((t): t is MediaStreamTrack => Boolean(t))
			),
		[]
	)

	return {
		turnMicOn,
		turnMicOff: mic.mute,
		audioStreamTrack,
		audioMonitorStreamTrack,
		audioEnabled,
		audioUnavailableReason,
		publicAudioTrack$,
		privateAudioTrack$,
		audioDeviceId: mic.activeDevice$.value?.deviceId,
		setAudioDeviceId: (deviceId: string) => {
			const found = mic.devices$.value.find((d) => d.deviceId === deviceId)
			if (found) mic.setPreferredDevice(found)
		},

		setVideoDeviceId: (deviceId: string) => {
			const found = camera.devices$.value.find((d) => d.deviceId === deviceId)
			if (found) camera.setPreferredDevice(found)
		},
		videoDeviceId: camera.activeDevice$.value?.deviceId,
		turnCameraOn,
		turnCameraOff: camera.stopBroadcasting,
		toggleCameraFacing: () => camera.toggleCameraFacing(),
		videoEnabled,
		videoUnavailableReason,
		blurVideo,
		setBlurVideo,
		suppressNoise,
		setSuppressNoise,
		videoTrack$,
		videoStreamTrack,

		startScreenShare,
		endScreenShare,
		screenShareVideoTrack,
		screenShareEnabled,
		screenShareVideoTrack$,
	}
}

export type UserMedia = ReturnType<typeof useUserMedia>
