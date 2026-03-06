import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { json, redirect } from '@remix-run/cloudflare'
import { Outlet, useLoaderData, useParams } from '@remix-run/react'
import { useObservableAsValue, useValueAsObservable } from 'partytracks/react'
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type Dispatch,
	type SetStateAction,
} from 'react'
import { useLocalStorage } from 'react-use'
import { of } from 'rxjs'
import invariant from 'tiny-invariant'
import { Button } from '~/components/Button'
import { EnsureOnline } from '~/components/EnsureOnline'
import { EnsurePermissions } from '~/components/EnsurePermissions'
import { Icon } from '~/components/Icon/Icon'
import { Spinner } from '~/components/Spinner'
import type { ClientMessage } from '~/types/Messages'

import { usePeerConnection } from '~/hooks/usePeerConnection'
import useRoom from '~/hooks/useRoom'
import { type RoomContextType } from '~/hooks/useRoomContext'
import { useRoomHistory } from '~/hooks/useRoomHistory'
import { useSpeechToText } from '~/hooks/useSpeechToText'
import { useStablePojo } from '~/hooks/useStablePojo'
import useUserMedia from '~/hooks/useUserMedia'
import { useWorkersAiASR } from '~/hooks/useWorkersAiASR'
import type { TrackObject } from '~/utils/callsTypes'
import { useE2EE } from '~/utils/e2ee'
import { getIceServers } from '~/utils/getIceServers.server'
import { mode } from '~/utils/mode'

function numberOrUndefined(value: unknown): number | undefined {
	const num = Number(value)
	return isNaN(num) ? undefined : num
}

function trackObjectToString(trackObject?: TrackObject) {
	if (!trackObject) return undefined
	return trackObject.sessionId + '/' + trackObject.trackName
}

export const loader = async ({ context, params }: LoaderFunctionArgs) => {
	const { roomName } = params
	if (!roomName) {
		throw redirect('/')
	}

	try {
		const rooms = context.env?.rooms ?? (context as any).rooms
		if (!rooms) {
			console.error('Durable Object binding "rooms" not found in context.')
			throw redirect('/?error=server-config-error')
		}

		const id = rooms.idFromName(roomName)
		const stub = rooms.get(id)
		const response = await stub.fetch(`https://party/exists`, {
			headers: {
				'x-partykit-room': roomName,
				'x-partykit-namespace': 'rooms',
			},
		})
		if (response.status === 404) {
			throw redirect('/?error=room-not-found')
		}
		if (!response.ok) {
			console.error('Room existence check failed with status:', response.status)
			throw redirect('/?error=check-failed')
		}
	} catch (err) {
		if (err instanceof Response) throw err // Re-throw redirects
		console.error('Loader check error:', err)
		throw redirect('/?error=unexpected-error')
	}

	const {
		env: {
			TRACE_LINK,
			API_EXTRA_PARAMS,
			MAX_WEBCAM_FRAMERATE,
			MAX_WEBCAM_BITRATE,
			MAX_WEBCAM_QUALITY_LEVEL,
			MAX_API_HISTORY,
			EXPERIMENTAL_SIMULCAST_ENABLED,
		},
	} = context

	return json({
		userDirectoryUrl: context.env.USER_DIRECTORY_URL,
		traceLink: TRACE_LINK,
		apiExtraParams: API_EXTRA_PARAMS,
		iceServers: await getIceServers(context.env),
		feedbackEnabled: Boolean(
			context.env.FEEDBACK_URL &&
				context.env.FEEDBACK_QUEUE &&
				context.env.FEEDBACK_STORAGE
		),
		maxWebcamFramerate: numberOrUndefined(MAX_WEBCAM_FRAMERATE),
		maxWebcamBitrate: numberOrUndefined(MAX_WEBCAM_BITRATE),
		maxWebcamQualityLevel: numberOrUndefined(MAX_WEBCAM_QUALITY_LEVEL),
		maxApiHistory: numberOrUndefined(MAX_API_HISTORY),
		simulcastEnabled: EXPERIMENTAL_SIMULCAST_ENABLED === 'true',
		e2eeEnabled: context.env.E2EE_ENABLED === 'true',
		aiEnabled: context.env.ENABLE_WORKERS_AI === 'true',
	})
}

export default function RoomWithPermissions() {
	const [micDeviceId, setMicDeviceId] = useState<string>()
	const [cameraDeviceId, setCameraDeviceId] = useState<string>()
	return (
		<EnsurePermissions
			onCameraSelected={setCameraDeviceId}
			onMicSelected={setMicDeviceId}
		>
			<EnsureOnline
				fallback={
					<div className="grid h-full place-items-center">
						<div>
							<h1 className="flex items-center gap-3 text-3xl font-black">
								<Icon type="SignalSlashIcon" />
								You are offline
							</h1>
						</div>
					</div>
				}
			>
				<RoomPreparation
					micDeviceId={micDeviceId}
					cameraDeviceId={cameraDeviceId}
				/>
			</EnsureOnline>
		</EnsurePermissions>
	)
}

function RoomPreparation(props: {
	micDeviceId?: string
	cameraDeviceId?: string
}) {
	const { roomName } = useParams()
	invariant(roomName)
	const userMedia = useUserMedia(props)
	const room = useRoom({ roomName, userMedia })

	const [isTimedOut, setIsTimedOut] = useState(false)
	useMemo(() => {
		const t = setTimeout(() => {
			if (!room.roomState.meetingId) setIsTimedOut(true)
		}, 8000)
		return () => clearTimeout(t)
	}, [room.roomState.meetingId])

	if (room.roomState.meetingId) {
		return <Room room={room} userMedia={userMedia} />
	}

	return (
		<div className="grid place-items-center h-full bg-zinc-950">
			<div className="text-center space-y-6 max-w-xs px-6">
				<Spinner className="text-orange-500 mx-auto w-10 h-10" />
				<div className="space-y-2">
					<h2 className="text-xl font-black text-zinc-100 uppercase tracking-tight">
						Connecting to Room
					</h2>
					<p className="text-sm text-zinc-500">
						{room.isConnected
							? 'Connected! Fetching meeting details...'
							: 'Establishing a secure connection to the meeting...'}
					</p>
				</div>
				{isTimedOut && (
					<div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
						<p className="text-xs text-orange-500/80 font-medium">
							Taking longer than usual. This might be due to a poor network
							connection or server delay.
						</p>
						<div className="flex flex-col gap-2">
							<Button
								className="w-full"
								onClick={() => window.location.reload()}
							>
								Retry Connection
							</Button>
							<p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
								Room: {roomName}
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

function tryToGetDimensions(videoStreamTrack?: MediaStreamTrack) {
	if (videoStreamTrack === undefined) {
		return { height: 0, width: 0 }
	}
	const height = videoStreamTrack?.getSettings().height ?? 0
	const width = videoStreamTrack?.getSettings().width ?? 0
	return { height, width }
}

interface RoomProps {
	room: ReturnType<typeof useRoom>
	userMedia: ReturnType<typeof useUserMedia>
}

function Room({ room, userMedia }: RoomProps) {
	const [joined, setJoined] = useState(false)
	const [dataSaverMode, setDataSaverMode] = useState(false)
	const [audioOnlyMode, setAudioOnlyMode] = useState(false)
	const { roomName } = useParams()
	invariant(roomName)

	const {
		userDirectoryUrl,
		traceLink,
		feedbackEnabled,
		apiExtraParams,
		iceServers,
		maxWebcamBitrate = 2_500_000,
		maxWebcamFramerate = 24,
		maxWebcamQualityLevel = 1080,
		maxApiHistory = 100,
		simulcastEnabled,
		e2eeEnabled,
		aiEnabled,
	} = useLoaderData<typeof loader>()

	const [storedWebcamBitrate, setStoredWebcamBitrate] =
		useLocalStorage<number>('settings-webcam-bitrate', maxWebcamBitrate)
	const webcamBitrate = storedWebcamBitrate ?? maxWebcamBitrate
	const [storedWebcamFramerate, setStoredWebcamFramerate] =
		useLocalStorage<number>('settings-webcam-framerate', maxWebcamFramerate)
	const webcamFramerate = storedWebcamFramerate ?? maxWebcamFramerate
	const [storedWebcamQuality, setStoredWebcamQuality] =
		useLocalStorage<number>('settings-webcam-quality', maxWebcamQualityLevel)
	const webcamQuality = storedWebcamQuality ?? maxWebcamQualityLevel
	const [videoDenoise, setVideoDenoise] = useLocalStorage<boolean>(
		'settings-video-denoise',
		false
	) ?? false

	const params = new URLSearchParams(apiExtraParams)

	invariant(room.roomState.meetingId, 'Meeting ID cannot be missing')
	params.set('correlationId', room.roomState.meetingId)

	const { partyTracks, iceConnectionState } = usePeerConnection({
		maxApiHistory,
		apiExtraParams: params.toString(),
		iceServers,
	})
	const peerConnection = useObservableAsValue(partyTracks.peerConnection$)
	const roomHistory = useRoomHistory(partyTracks, room)

	const setWebcamBitrate: Dispatch<SetStateAction<number>> = (val) => {
		setStoredWebcamBitrate((prev) => {
			const prevVal = prev ?? maxWebcamBitrate
			return typeof val === 'function' ? val(prevVal) : val
		})
	}
	const setWebcamFramerate: Dispatch<SetStateAction<number>> = (val) => {
		setStoredWebcamFramerate((prev) => {
			const prevVal = prev ?? maxWebcamFramerate
			return typeof val === 'function' ? val(prevVal) : val
		})
	}
	const setWebcamQuality: Dispatch<SetStateAction<number>> = (val) => {
		setStoredWebcamQuality((prev) => {
			const prevVal = prev ?? maxWebcamQualityLevel
			return typeof val === 'function' ? val(prevVal) : val
		})
	}

	const scaleResolutionDownBy = useMemo(() => {
		const videoStreamTrack = userMedia.videoStreamTrack
		const { height, width } = tryToGetDimensions(videoStreamTrack)
		// we need to do this in case camera is in portrait mode
		const smallestDimension = Math.min(height, width)
		// Use user-selected quality, capped by server max
		const effectiveQuality = Math.min(webcamQuality, maxWebcamQualityLevel)
		return Math.max(smallestDimension / effectiveQuality, 1)
	}, [maxWebcamQualityLevel, userMedia.videoStreamTrack, webcamQuality])

	const effectiveWebcamBitrate = videoDenoise
		? Math.min(maxWebcamBitrate, Math.max(webcamBitrate, 2_000_000))
		: webcamBitrate
	const sendEncodings = useStablePojo<RTCRtpEncodingParameters[]>(
		simulcastEnabled
			? [
				{
					rid: 'a',
					maxBitrate: Math.min(1_800_000, effectiveWebcamBitrate),
					maxFramerate: Math.min(30.0, webcamFramerate),
					active: true,
				},
				{
					rid: 'b',
					scaleResolutionDownBy: videoDenoise ? 1.5 : 2.0,
					maxBitrate: Math.min(700_000, effectiveWebcamBitrate),
					maxFramerate: Math.min(24.0, webcamFramerate),
					active: true,
				},
			]
			: [
				{
					maxFramerate: Math.min(maxWebcamFramerate, webcamFramerate),
					maxBitrate: Math.min(maxWebcamBitrate, effectiveWebcamBitrate),
					scaleResolutionDownBy: videoDenoise ? 1 : scaleResolutionDownBy,
				},
			]
	)
	const sendEncodings$ = useValueAsObservable(sendEncodings)

	const pushedVideoTrack$ = useMemo(
		() =>
			partyTracks.push(userMedia.videoTrack$, {
				sendEncodings$,
			}),
		[partyTracks, userMedia.videoTrack$, sendEncodings$]
	)

	const pushedVideoTrack = useObservableAsValue(pushedVideoTrack$)

	const pushedAudioTrack$ = useMemo(
		() =>
			partyTracks.push(userMedia.publicAudioTrack$, {
				sendEncodings$: of([
					{
						networkPriority: 'high',
						maxBitrate: 128_000, // 128kbps for high quality audio
					},
				]),
			}),
		[partyTracks, userMedia.publicAudioTrack$]
	)
	const pushedAudioTrack = useObservableAsValue(pushedAudioTrack$)

	const pushedScreenSharingTrack$ = useMemo(
		() => partyTracks.push(userMedia.screenShareVideoTrack$),
		[partyTracks, userMedia.screenShareVideoTrack$]
	)
	const pushedScreenSharingTrack = useObservableAsValue(
		pushedScreenSharingTrack$
	)
	const [pinnedTileIds, setPinnedTileIds] = useState<string[]>([])
	const [showDebugInfo, setShowDebugInfo] = useState(mode !== 'production')
	const [captionsEnabled, setCaptionsEnabled] = useState(false)
	const [asrSource, setAsrSource] = useState<'browser' | 'workers-ai'>(
		'browser'
	)
	const [aiTranslationEnabled, setAiTranslationEnabled] = useState(true)
	const [moqEnabled, setMoqEnabled] = useState(false)
	const [chatMessages, setChatMessages] = useState<
		{ id: string; sender: string; text: string; time: Date; isSelf: boolean }[]
	>([])

	const tiers = useMemo(
		() => [
			{
				bitrate: 600_000,
				framerate: 15,
				scale: 2,
			},
			{
				bitrate: Math.min(1_500_000, maxWebcamBitrate),
				framerate: Math.min(24, maxWebcamFramerate),
				scale: 1.5,
			},
			{
				bitrate: Math.min(3_000_000, maxWebcamBitrate),
				framerate: Math.min(30, maxWebcamFramerate),
				scale: 1.2,
			},
			{
				bitrate: Math.min(5_000_000, maxWebcamBitrate),
				framerate: Math.min(45, maxWebcamFramerate),
				scale: 1,
			},
			{
				bitrate: Math.min(8_500_000, maxWebcamBitrate),
				framerate: Math.min(60, maxWebcamFramerate),
				scale: 1,
			},
		], [maxWebcamBitrate, maxWebcamFramerate]
	)

	useEffect(() => {
		if (!peerConnection) return
		let stopped = false
		const tierRef = { current: 2 }
		const last = {
			t: performance.now(),
			bytes: 0,
			lost: 0,
			recv: 0,
		}

		const pickSender = (): RTCRtpSender | undefined => {
			return peerConnection
				.getSenders()
				.find((s) => s.track?.kind === 'video')
		}

		const applyTier = async (
			sender: RTCRtpSender,
			target: { bitrate: number; framerate: number; scale: number }
		) => {
			const params = sender.getParameters()
			if (!params.encodings || params.encodings.length === 0) return
			const nextEncodings = params.encodings.map((enc) => {
				const base = {
					maxBitrate: Math.min(target.bitrate, maxWebcamBitrate),
					maxFramerate: Math.min(target.framerate, maxWebcamFramerate),
					scaleResolutionDownBy: Math.max(target.scale, 1),
				}
				if (enc.rid === 'b') {
					return {
						...enc,
						maxBitrate: Math.max(400_000, Math.min(target.bitrate / 2, maxWebcamBitrate)),
						maxFramerate: Math.min(target.framerate, maxWebcamFramerate),
						scaleResolutionDownBy: Math.max(target.scale * 1.4, 1.5),
					}
				}
				if (enc.rid === 'a') {
					return { ...enc, ...base }
				}
				return { ...enc, ...base }
			})
			const changed = JSON.stringify(params.encodings) !== JSON.stringify(nextEncodings)
			if (!changed) return
			params.encodings = nextEncodings
			try {
				await sender.setParameters(params)
			} catch (err) {
				console.warn('setParameters failed', err)
			}
		}

		const interval = window.setInterval(async () => {
			if (stopped) return
			const sender = pickSender()
			if (!sender) return
			let outbound: any
			let remote: any
			try {
				const stats = await sender.getStats()
				for (const report of stats.values()) {
					if (report.type === 'outbound-rtp' && report.kind === 'video' && !report.isRemote) {
						if (!outbound || report.bytesSent > outbound.bytesSent) outbound = report
					}
					if (report.type === 'remote-inbound-rtp' && report.kind === 'video') remote = report
				}
			} catch (err) {
				return
			}
			if (!outbound) return
			const now = performance.now()
			const dt = now - last.t
			if (dt <= 0) return
			const bitrate = ((outbound.bytesSent - last.bytes) * 8) / (dt / 1000)
			last.t = now
			last.bytes = outbound.bytesSent
			let lossRate = 0
			let rtt = 0
			if (remote) {
				const recvDelta = (remote.packetsReceived ?? 0) - last.recv
				const lostDelta = (remote.packetsLost ?? 0) - last.lost
				const total = recvDelta + lostDelta
				lossRate = total > 0 ? Math.max(0, lostDelta) / total : 0
				rtt = remote.roundTripTime ?? 0
				last.recv = remote.packetsReceived ?? 0
				last.lost = remote.packetsLost ?? 0
			}

			const target = tiers[tierRef.current]
			if (lossRate > 0.05 || rtt > 0.3) {
				tierRef.current = Math.max(0, tierRef.current - 1)
			} else if (lossRate < 0.02 && bitrate > target.bitrate * 0.8 && rtt < 0.15) {
				tierRef.current = Math.min(tiers.length - 1, tierRef.current + 1)
			}
			await applyTier(sender, tiers[tierRef.current])
		}, 4000)

		return () => {
			stopped = true
			window.clearInterval(interval)
		}
	}, [peerConnection, tiers, maxWebcamBitrate, maxWebcamFramerate])

	useSpeechToText({
		enabled: captionsEnabled && joined && asrSource === 'browser',
		onCaption: (text, isFinal) => {
			room.websocket.send(
				JSON.stringify({
					type: 'caption',
					text,
					isFinal,
					translate: aiTranslationEnabled,
				} satisfies ClientMessage)
			)
		},
	})

	useWorkersAiASR({
		enabled: captionsEnabled && joined && asrSource === 'workers-ai',
		audioStreamTrack: userMedia.audioStreamTrack ?? null,
		websocket: room.websocket as any,
	})

	const { e2eeSafetyNumber, onJoin } = useE2EE({
		enabled: e2eeEnabled,
		room,
		partyTracks,
	})

	const context: RoomContextType & {
		webcamBitrate: number
		setWebcamBitrate: Dispatch<SetStateAction<number>>
		webcamFramerate: number
		setWebcamFramerate: Dispatch<SetStateAction<number>>
		webcamQuality: number
		setWebcamQuality: Dispatch<SetStateAction<number>>
		videoDenoise: boolean
		setVideoDenoise: Dispatch<SetStateAction<boolean>>
		maxWebcamBitrate: number
		maxWebcamFramerate: number
		maxWebcamQualityLevel: number
	} = {
		joined,
		setJoined,
		pinnedTileIds,
		setPinnedTileIds,
		showDebugInfo,
		setShowDebugInfo,
		dataSaverMode,
		setDataSaverMode,
		audioOnlyMode,
		setAudioOnlyMode,
		webcamBitrate,
		setWebcamBitrate,
		webcamFramerate,
		setWebcamFramerate,
		webcamQuality,
		setWebcamQuality,
		videoDenoise,
		setVideoDenoise,
		maxWebcamBitrate,
		maxWebcamFramerate,
		maxWebcamQualityLevel,
		captionsEnabled,
		setCaptionsEnabled,
		asrSource,
		setAsrSource,
		aiEnabled,
		aiTranslationEnabled,
		setAiTranslationEnabled,
		moqEnabled,
		setMoqEnabled,
		chatMessages,
		setChatMessages,
		traceLink,
		userMedia,
		userDirectoryUrl,
		feedbackEnabled,
		partyTracks,
		roomHistory,
		e2eeSafetyNumber,
		e2eeOnJoin: onJoin,
		iceConnectionState,
		room,
		simulcastEnabled,
		pushedTracks: {
			video: trackObjectToString(pushedVideoTrack),
			audio: trackObjectToString(pushedAudioTrack),
			screenshare: trackObjectToString(pushedScreenSharingTrack),
		},
	}

	return <Outlet context={context} />
}
