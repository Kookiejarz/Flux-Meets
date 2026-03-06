import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import {
	useLoaderData,
	useNavigate,
	useParams,
	useSearchParams,
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import { useMount, useWindowSize } from 'react-use'
import { AiButton } from '~/components/AiButton'
import { Button, ButtonLink } from '~/components/Button'
import { CameraButton } from '~/components/CameraButton'
import { ChatPanel } from '~/components/ChatPanel'
import { CopyButton } from '~/components/CopyButton'
import { HighPacketLossWarningsToast } from '~/components/HighPacketLossWarningsToast'
import { IceDisconnectedToast } from '~/components/IceDisconnectedToast'
import { Icon } from '~/components/Icon/Icon'
import { LeaveRoomButton } from '~/components/LeaveRoomButton'
import { MicButton } from '~/components/MicButton'
import { OverflowMenu } from '~/components/OverflowMenu'
import { ParticipantLayout } from '~/components/ParticipantLayout'
import { ParticipantsButton } from '~/components/ParticipantsMenu'
import { PullAudioTracks } from '~/components/PullAudioTracks'
import { RaiseHandButton } from '~/components/RaiseHandButton'
import { SafetyNumberToast } from '~/components/SafetyNumberToast'
import { ScreenshareButton } from '~/components/ScreenshareButton'
import Toast, { useDispatchToast } from '~/components/Toast'
import { Tooltip } from '~/components/Tooltip'
import useBroadcastStatus from '~/hooks/useBroadcastStatus'
import useIsSpeaking from '~/hooks/useIsSpeaking'
import { useMoQ } from '~/hooks/useMoQ'
import { useRoomContext } from '~/hooks/useRoomContext'
import { useRoomUrl } from '~/hooks/useRoomUrl'
import useSounds from '~/hooks/useSounds'
import useStageManager from '~/hooks/useStageManager'
import { useUserJoinLeaveToasts } from '~/hooks/useUserJoinLeaveToasts'
import { dashboardLogsLink } from '~/utils/dashboardLogsLink'
import getUsername from '~/utils/getUsername.server'
import isNonNullable from '~/utils/isNonNullable'

import { AnimatePresence, motion } from 'framer-motion'

import { MeetingTimer } from '~/components/MeetingTimer'
import { playSound } from '~/utils/playSound'

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const username = await getUsername(request)

	return {
		username,
		bugReportsEnabled: Boolean(
			context.env.FEEDBACK_URL &&
				context.env.FEEDBACK_QUEUE &&
				context.env.FEEDBACK_STORAGE
		),
		disableLobbyEnforcement: context.env.DISABLE_LOBBY_ENFORCEMENT === 'true',
		mode: context.mode,
		hasDb: Boolean(context.env.DB),
		hasAiCredentials: Boolean(
			context.env.OPENAI_API_TOKEN && context.env.OPENAI_MODEL_ENDPOINT
		),
		dashboardDebugLogsBaseUrl: context.env.DASHBOARD_WORKER_URL,
	}
}

export default function Room() {
	const { joined } = useRoomContext()
	const navigate = useNavigate()
	const { roomName } = useParams()
	const { mode, bugReportsEnabled, disableLobbyEnforcement } =
		useLoaderData<typeof loader>()
	const [search] = useSearchParams()

	useEffect(() => {
		if (!joined && mode !== 'development' && !disableLobbyEnforcement)
			navigate(`/${roomName}${search.size > 0 ? '?' + search.toString() : ''}`)
	}, [joined, mode, navigate, roomName, search, disableLobbyEnforcement])

	if (!joined && mode !== 'development' && !disableLobbyEnforcement) return null

	return (
		<Toast.Provider>
			<JoinedRoom bugReportsEnabled={bugReportsEnabled} />
		</Toast.Provider>
	)
}

function JoinedRoom({ bugReportsEnabled }: { bugReportsEnabled: boolean }) {
	const { hasDb, hasAiCredentials, dashboardDebugLogsBaseUrl } =
		useLoaderData<typeof loader>()
	const {
		userMedia,
		partyTracks,
		pushedTracks,
		showDebugInfo,
		pinnedTileIds,
		room,
		captionsEnabled,
		setCaptionsEnabled,
		moqEnabled,
		setChatMessages,
		e2eeSafetyNumber,
		e2eeOnJoin,
	} = useRoomContext()
	const {
		otherUsers,
		websocket,
		identity,
		roomState: { meetingId },
	} = room

	const [unreadCount, setUnreadCount] = useState(0)
	const [chatOpen, setChatOpen] = useState(false)

	const [raisedHand, setRaisedHand] = useState(false)
	// Only monitor speaking when mic is enabled, otherwise always false
	const speaking = useIsSpeaking(
		userMedia.audioEnabled ? userMedia.audioStreamTrack : undefined
	)

	// 初始化端到端加密（仅在组件挂载时执行一次）
	useMount(() => {
		// 判断是否是第一个用户（房间中没有其他用户）
		const isFirstUser = otherUsers.length === 0
		e2eeOnJoin(isFirstUser)
	})

	useEffect(() => {
		if (chatOpen) setUnreadCount(0)
	}, [chatOpen])

	useEffect(() => {
		const handleMessage = (e: MessageEvent) => {
			const data = JSON.parse(e.data)
			if (data.type === 'roomMessage') {
				setChatMessages((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						sender: data.from,
						text: data.message,
						time: new Date(),
						isSelf: false,
					},
				])
				if (!chatOpen) {
					setUnreadCount((c) => c + 1)
				}
				playSound('message').catch(console.error)
			}
		}

		websocket.addEventListener('message', handleMessage)
		return () => websocket.removeEventListener('message', handleMessage)
	}, [websocket, chatOpen, setChatMessages])

	const roomUrl = useRoomUrl()

	const moqStatus = useMoQ(moqEnabled)

	useMount(() => {
		if (otherUsers.length > 5) {
			userMedia.turnMicOff()
		}
	})

	useBroadcastStatus({
		userMedia,
		partyTracks,
		websocket,
		identity,
		pushedTracks,
		raisedHand,
		speaking,
	})

	useSounds(otherUsers)
	useUserJoinLeaveToasts(otherUsers)

	const { width } = useWindowSize()

	const someScreenshare =
		otherUsers.some((u) => u.tracks.screenShareEnabled) ||
		Boolean(identity?.tracks.screenShareEnabled)
	const stageLimit = width < 600 ? 2 : someScreenshare ? 5 : 9

	const { recordActivity, actorsOnStage } = useStageManager(
		otherUsers,
		stageLimit,
		identity
	)

	useEffect(() => {
		otherUsers.forEach((u) => {
			if (u.speaking || u.raisedHand) recordActivity(u)
		})
	}, [otherUsers, recordActivity])

	const pinnedActors = actorsOnStage.filter((u) => pinnedTileIds.includes(u.id))
	const unpinnedActors = actorsOnStage.filter(
		(u) => !pinnedTileIds.includes(u.id)
	)

	const gridGap = 12
	const dispatchToast = useDispatchToast()

	useEffect(() => {
		if (moqEnabled) {
			dispatchToast(
				'Experimental: Media over QUIC mode enabled. Attempting to connect to Cloudflare Draft-14 Relay...',
				{ id: 'moq-enabled' }
			)
		}
	}, [moqEnabled, dispatchToast])

	useEffect(() => {
		if (moqStatus.state === 'connected') {
			dispatchToast('🚀 MoQ: Successfully connected to Cloudflare Relay!', {
				id: 'moq-status',
			})
		} else if (moqStatus.state === 'error') {
			dispatchToast(`❌ MoQ Connection Error: ${moqStatus.error}`, {
				id: 'moq-status',
			})
		}
	}, [moqStatus, dispatchToast])

	useEffect(() => {
		if (e2eeSafetyNumber) {
			dispatchToast(
				<SafetyNumberToast safetyNumber={e2eeSafetyNumber.slice(0, 8)} />,
				{ duration: Infinity, id: 'e2ee-safety-number' }
			)
		}
	}, [e2eeSafetyNumber, dispatchToast])

	return (
		<PullAudioTracks
			audioTracks={otherUsers.map((u) => u.tracks.audio).filter(isNonNullable)}
		>
			<div className="flex h-full bg-zinc-950 text-zinc-100 overflow-hidden">
				<div className="flex flex-col flex-1 min-w-0">
					<div className="relative flex-grow bg-zinc-900 isolate sm:m-4 sm:rounded-2xl sm:shadow-2xl sm:ring-1 sm:ring-white/10 overflow-hidden">
						<div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<MeetingTimer startTime={room.roomState.startTime} />
								{showDebugInfo && meetingId && (
									<div className="bg-zinc-950/60 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-zinc-400 border border-white/10 shadow-lg select-all pointer-events-auto">
										ID: {meetingId.slice(0, 8)}
									</div>
								)}
							</div>
						</div>
						<div
							style={{ '--gap': gridGap + 'px' } as any}
							className="absolute inset-0 flex isolate p-[--gap] gap-[--gap]"
						>
							{pinnedActors.length > 0 && (
								<div className="flex-grow-[5] overflow-hidden relative">
									<ParticipantLayout
										users={pinnedActors.filter(isNonNullable)}
										gap={gridGap}
										aspectRatio="16:9"
									/>
								</div>
							)}
							<div className="flex-grow overflow-hidden relative">
								<ParticipantLayout
									users={unpinnedActors.filter(isNonNullable)}
									gap={gridGap}
									aspectRatio="4:3"
								/>
							</div>
						</div>
						<Toast.Viewport className="absolute top-4 right-4" />
					</div>
					<div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-4 pt-2 md:gap-4 md:px-8 md:pb-6 md:pt-2">
						{hasAiCredentials && <AiButton recordActivity={recordActivity} />}
						<MicButton warnWhenSpeakingWhileMuted />
						<CameraButton />
						<Tooltip
							content={captionsEnabled ? 'Disable Captions' : 'Enable Captions'}
						>
							<Button
								onClick={() => {
									console.log(
										'CC Toggle clicked, current state:',
										captionsEnabled
									)
									setCaptionsEnabled(!captionsEnabled)
								}}
								displayType={captionsEnabled ? 'primary' : 'secondary'}
							>
								<Icon
									type={
										captionsEnabled
											? 'chatBubbleBottomCenterText'
											: 'chatBubbleBottomCenterText'
									}
								/>
								{!captionsEnabled && (
									<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
										<div className="w-[1px] h-6 bg-current rotate-45 opacity-60" />
									</div>
								)}
							</Button>
						</Tooltip>
						<ScreenshareButton />
						<RaiseHandButton
							raisedHand={raisedHand}
							onClick={() => setRaisedHand(!raisedHand)}
						/>
						<ParticipantsButton
							identity={identity}
							otherUsers={otherUsers}
							className="hidden md:block"
						></ParticipantsButton>
						<Tooltip content={chatOpen ? 'Close Chat' : 'Open Chat'}>
							<Button
								onClick={() => setChatOpen(!chatOpen)}
								displayType={chatOpen ? 'primary' : 'secondary'}
								className="relative"
							>
								<Icon type="chatBubbleLeftRight" />
								{!chatOpen && unreadCount > 0 && (
									<span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-[10px] font-bold text-white ring-2 ring-zinc-950">
										{unreadCount > 9 ? '9+' : unreadCount}
									</span>
								)}
							</Button>
						</Tooltip>
						<OverflowMenu bugReportsEnabled={bugReportsEnabled} />
						<LeaveRoomButton
							navigateToFeedbackPage={hasDb}
							meetingId={meetingId}
						/>
						<CopyButton className="text-sm px-3 py-2" contentValue={roomUrl}>
							<span className="hidden md:inline">Copy Link</span>
						</CopyButton>
						{showDebugInfo && meetingId && dashboardDebugLogsBaseUrl && (
							<ButtonLink
								className="text-xs"
								displayType="secondary"
								to={dashboardLogsLink(dashboardDebugLogsBaseUrl, [
									{
										id: '2',
										key: 'meetingId',
										type: 'string',
										value: meetingId,
										operation: 'eq',
									},
								])}
								target="_blank"
								rel="noreferrer"
							>
								Meeting Logs
							</ButtonLink>
						)}
					</div>
				</div>
				<AnimatePresence>
					{chatOpen && (
						<motion.div
							initial={{ x: '100%' }}
							animate={{ x: 0 }}
							exit={{ x: '100%' }}
							transition={{ type: 'spring', damping: 25, stiffness: 200 }}
							className="fixed inset-0 z-50 md:relative md:inset-auto md:w-80 border-l border-white/10 shadow-2xl h-full bg-zinc-900 overflow-hidden"
						>
							<div className="w-full h-full">
								<ChatPanel onClose={() => setChatOpen(false)} />
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
			<HighPacketLossWarningsToast />
			<IceDisconnectedToast />
		</PullAudioTracks>
	)
}
