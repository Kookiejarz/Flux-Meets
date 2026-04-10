import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { data } from '@remix-run/cloudflare'
import { useNavigate, useParams, useSearchParams } from '@remix-run/react'
import { useObservableAsValue } from 'partytracks/react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import invariant from 'tiny-invariant'
import { AudioIndicator } from '~/components/AudioIndicator'
import { Button } from '~/components/Button'
import { CameraButton } from '~/components/CameraButton'
import { CopyButton } from '~/components/CopyButton'
import { Disclaimer } from '~/components/Disclaimer'
import { Icon } from '~/components/Icon/Icon'
import { Input } from '~/components/Input'
import { MicButton } from '~/components/MicButton'

import { SelfView } from '~/components/SelfView'
import { SettingsButton } from '~/components/SettingsDialog'
import { Spinner } from '~/components/Spinner'
import { Tooltip } from '~/components/Tooltip'
import { useRoomContext } from '~/hooks/useRoomContext'
import { useRoomUrl } from '~/hooks/useRoomUrl'
import { shouldCreateE2EEGroup } from '~/utils/e2eePeers'
import getUsername from '~/utils/getUsername.server'

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const username = await getUsername(request)
	invariant(username)
	return data({ username, callsAppId: context.env.CALLS_APP_ID })
}

let refreshCheckDone = false
function trackRefreshes() {
	if (refreshCheckDone) return
	if (typeof document === 'undefined') return

	const key = `previously loaded`
	const initialValue = sessionStorage.getItem(key)
	const refreshed = initialValue !== null
	sessionStorage.setItem(key, Date.now().toString())

	if (refreshed) {
		fetch(`/api/reportRefresh`, {
			method: 'POST',
		})
	}

	refreshCheckDone = true
}

export default function Lobby() {
	const { roomName } = useParams()
	const navigate = useNavigate()
	const {
		setJoined,
		userMedia,
		room,
		partyTracks,
		e2eeOnJoin,
		e2eeStatus,
		e2eeConfigState,
	} = useRoomContext()
	const { videoStreamTrack, audioStreamTrack, audioEnabled } = userMedia
	const session = useObservableAsValue(partyTracks.session$)
	const sessionError = useObservableAsValue(partyTracks.sessionError$)
	trackRefreshes()

	const [isEditingName, setIsEditingName] = useState(false)
	const [editedRoomName, setEditedRoomName] = useState(roomName || '')

	const joinedUsers = new Set(
		room.otherUsers.filter((u) => u.tracks.audio).map((u) => u.name)
	).size
	const lastE2eeMeetingIdRef = useRef<string | null>(null)

	useEffect(() => {
		if (!e2eeStatus.enabled) return
		if (!room.isConnected || !room.identity || !room.roomState.meetingId) return

		// If we already initialized for this specific meetingId, don't do it again
		if (lastE2eeMeetingIdRef.current === room.roomState.meetingId) return

		// E2EE starts in the lobby, so we must look at all connected sessions,
		// not only users that have already clicked Join.
		const isFirstUser = shouldCreateE2EEGroup(
			room.roomState.users,
			room.websocket.id
		)

		console.log('[E2EE] Joining room. isFirstUser:', isFirstUser, 'meetingId:', room.roomState.meetingId)
		e2eeOnJoin(isFirstUser)
		lastE2eeMeetingIdRef.current = room.roomState.meetingId
	}, [
		e2eeOnJoin,
		e2eeStatus.enabled,
		room.isConnected,
		room.identity,
		room.roomState.meetingId,
		room.roomState.users,
		room.websocket.id,
	])

	const roomUrl = useRoomUrl()

	const [params] = useSearchParams()

	const e2eeGateReady = useMemo(() => {
		if (!e2eeStatus.enabled) return true
		return e2eeStatus.strictReady
	}, [e2eeStatus.enabled, e2eeStatus.strictReady])

	const e2eeDisabledReason =
		e2eeConfigState === 'disabled_by_env' ||
		e2eeConfigState === 'production_misconfigured'
			? e2eeConfigState
			: null
	const e2eeJoinBlocked = e2eeConfigState === 'production_misconfigured'
	const canJoin =
		Boolean(session?.sessionId) && e2eeGateReady && !e2eeJoinBlocked

	const handleNameChange = () => {
		if (editedRoomName && editedRoomName !== roomName) {
			navigate(
				`/${editedRoomName.replace(/ /g, '-')}${
					params.size > 0 ? '?' + params.toString() : ''
				}`
			)
		}
		setIsEditingName(false)
	}

	return (
		<div
			className="flex flex-col items-center justify-center h-full p-4"
			translate="no"
		>
			<div className="flex-1"></div>
			<div className="space-y-4 w-96">
				<div className="space-y-1">
					{isEditingName ? (
						<div className="flex items-center gap-2">
							<Input
								autoFocus
								value={editedRoomName}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setEditedRoomName(e.target.value)
								}
								onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
									if (e.key === 'Enter') handleNameChange()
									if (e.key === 'Escape') {
										setEditedRoomName(roomName || '')
										setIsEditingName(false)
									}
								}}
								onBlur={handleNameChange}
								className="text-2xl font-bold h-10"
							/>
						</div>
					) : (
						<div
							className="group flex items-center gap-2 cursor-pointer"
							onClick={() => setIsEditingName(true)}
						>
							<h1 className="text-3xl font-bold break-all">{roomName}</h1>
							<Icon
								type="pencil"
								className="w-5 h-5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity"
							/>
						</div>
					)}
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						{`${joinedUsers} ${
							joinedUsers === 1 ? 'user' : 'users'
						} in the room.`}{' '}
					</p>
				</div>
				<div className="relative">
					<SelfView
						className="aspect-[4/3] w-full"
						videoTrack={videoStreamTrack}
					/>

					<div className="absolute left-3 top-3">
						{!sessionError && !session?.sessionId ? (
							<Spinner className="text-zinc-100" />
						) : (
							audioStreamTrack && (
								<>
									{audioEnabled ? (
										<AudioIndicator audioTrack={audioStreamTrack} />
									) : (
										<Tooltip content="Mic is turned off">
											<div className="text-white indication-shadow">
												<Icon type="micOff" />
												<VisuallyHidden>Mic is turned off</VisuallyHidden>
											</div>
										</Tooltip>
									)}
								</>
							)
						)}
					</div>
				</div>
				{sessionError && (
					<div className="p-3 rounded-md text-sm text-zinc-800 bg-red-200 dark:text-zinc-200 dark:bg-red-700">
						{sessionError}
					</div>
				)}
				{e2eeStatus.enabled ? (
					<div className="p-3 rounded-md text-sm text-zinc-200 bg-zinc-900/80 border border-white/10 space-y-2">
						<p className="font-semibold flex items-center gap-2">
							<Icon
								type="LockClosedIcon"
								className="w-4 h-4 text-emerald-400"
							/>
							E2EE Runtime Verification
						</p>
						<p>
							Sender transforms: {e2eeStatus.senderTransforms.bound}/
							{e2eeStatus.senderTransforms.required}
						</p>
						<p>
							Receiver transforms: {e2eeStatus.receiverTransforms.bound}/
							{e2eeStatus.receiverTransforms.required}
						</p>
						<p>
							Safety number:{' '}
							{e2eeStatus.safetyNumberReady ? 'ready' : 'pending'}
						</p>
						<p>
							Peer exchange:{' '}
							{e2eeStatus.peerExchangeRequired
								? e2eeStatus.peerExchangeCompleted
									? `completed (${e2eeStatus.peerExchangeParticipants})`
									: 'pending'
								: 'not required (no peers yet)'}
						</p>
						{!e2eeGateReady && (
							<p className="text-orange-300">
								Join is locked until E2EE checks pass.
							</p>
						)}
						{e2eeStatus.lastError && (
							<p className="text-red-300 break-words">
								E2EE error: {e2eeStatus.lastError}
							</p>
						)}
					</div>
				) : e2eeDisabledReason ? (
					<div className="p-3 rounded-md text-sm border space-y-2 bg-red-950/70 text-red-100 border-red-500/40">
						<p className="font-semibold flex items-center gap-2">
							<Icon type="ExclamationCircleIcon" className="w-4 h-4" />
							E2EE is disabled
						</p>
						<p>
							{e2eeDisabledReason === 'production_misconfigured'
								? 'Production cannot join without E2EE. The deployment is currently serving E2EE as disabled.'
								: 'This environment disabled E2EE via server configuration.'}
						</p>
						{e2eeJoinBlocked && (
							<p className="text-orange-200">
								Join is blocked until production E2EE is restored.
							</p>
						)}
					</div>
				) : null}
				{(userMedia.audioUnavailableReason ||
					userMedia.videoUnavailableReason) && (
					<div className="p-3 rounded-md text-sm text-zinc-800 bg-zinc-200 dark:text-zinc-200 dark:bg-zinc-700">
						{userMedia.audioUnavailableReason === 'NotAllowedError' &&
							userMedia.videoUnavailableReason === undefined && (
								<p>Mic permission was denied.</p>
							)}
						{userMedia.videoUnavailableReason === 'NotAllowedError' &&
							userMedia.audioUnavailableReason === undefined && (
								<p>Camera permission was denied.</p>
							)}
						{userMedia.audioUnavailableReason === 'NotAllowedError' &&
							userMedia.videoUnavailableReason === 'NotAllowedError' && (
								<p>Mic and camera permissions were denied.</p>
							)}
						{userMedia.audioUnavailableReason === 'NotAllowedError' && (
							<p>
								Enable permission
								{userMedia.audioUnavailableReason &&
								userMedia.videoUnavailableReason
									? 's'
									: ''}{' '}
								and reload the page to join.
							</p>
						)}
						{userMedia.audioUnavailableReason === 'DevicesExhaustedError' && (
							<p>No working microphone found.</p>
						)}
						{userMedia.videoUnavailableReason === 'DevicesExhaustedError' && (
							<p>No working webcam found.</p>
						)}
						{userMedia.audioUnavailableReason === 'UnknownError' && (
							<p>Unknown microphone error.</p>
						)}
						{userMedia.videoUnavailableReason === 'UnknownError' && (
							<p>Unknown webcam error.</p>
						)}
					</div>
				)}
				<div className="flex gap-4 text-sm">
					<Button
						onClick={() => {
							if (!canJoin) return
							setJoined(true)
							// we navigate here with javascript instead of an a
							// tag because we don't want it to be possible to join
							// the room without the JS having loaded
							navigate(
								'room' + (params.size > 0 ? '?' + params.toString() : '')
							)
						}}
						disabled={!canJoin}
					>
						Join
					</Button>
					<MicButton />
					<CameraButton />
					<SettingsButton />
					<Tooltip content="Copy URL">
						<CopyButton contentValue={roomUrl}></CopyButton>
					</Tooltip>
				</div>
			</div>
			<div className="flex flex-col justify-end flex-1">
				<Disclaimer className="pt-6" />
			</div>
		</div>
	)
}
