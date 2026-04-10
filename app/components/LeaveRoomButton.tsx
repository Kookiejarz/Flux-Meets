import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useNavigate, useParams } from '@remix-run/react'
import type { FC } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import { camera, mic, screenshare } from '../hooks/useUserMedia'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

interface LeaveRoomButtonProps {
	navigateToFeedbackPage: boolean
	meetingId?: string
	className?: string
}

export const LeaveRoomButton: FC<LeaveRoomButtonProps> = ({
	navigateToFeedbackPage,
	meetingId,
	className,
}) => {
	const navigate = useNavigate()
	const { roomName: roomNameParam } = useParams()
	const {
		room: {
			roomState: {
				startTime,
				users,
				roomName: roomStateName,
				meetingId: roomStateMeetingId,
			},
		},
	} = useRoomContext()

	// Try multiple sources for room name
	const effectiveRoomName = roomNameParam || roomStateName || 'Private'
	const effectiveMeetingId = meetingId || roomStateMeetingId

	const participantSnapshot = Array.from(
		new Map(
			users
				.filter((u): u is NonNullable<typeof u> => Boolean(u))
				.filter((u) => u.id !== 'ai')
				.map((u) => [
					u.id,
					{
						userId: u.id,
						userName: (u.name || '').trim().slice(0, 80),
					},
				])
		).values()
	)
		.filter((u) => u.userName.length > 0)
		.slice(0, 50)

	return (
		<Tooltip content="Leave">
			<Button
				displayType="danger"
				className={className}
				onClick={() => {
					const endedAt = Date.now()

					// Stop all media devices before leaving
					console.log('📴 Stopping all media devices...')
					mic.stopBroadcasting()
					camera.stopBroadcasting()
					screenshare.stopBroadcasting()

					const params = new URLSearchParams()
					if (participantSnapshot.length > 0) {
						params.set('participants', JSON.stringify(participantSnapshot))
					}

					params.set('roomName', effectiveRoomName)

					const finalStartedAt =
						typeof startTime === 'number' ? startTime : Date.now()
					params.set('startedAt', String(finalStartedAt))
					params.set('endedAt', String(endedAt))
					params.set('userCount', String(participantSnapshot.length))

					if (effectiveMeetingId) {
						// best-effort mark meeting ended using client timestamp
						const body = new URLSearchParams({ meetingId: effectiveMeetingId })
						fetch('/api/meeting-end', {
							method: 'POST',
							body,
							keepalive: true,
						}).catch(() => {})

						params.set('meetingId', effectiveMeetingId)

						console.log('[Leave] Navigating to summary with:', Object.fromEntries(params.entries()))
					} else {
						console.warn(
							'No meetingId found, navigating to summary with client snapshot only'
						)
					}

					navigate(`/summary?${params}`)
				}}
			>
				<VisuallyHidden>Leave</VisuallyHidden>
				<Icon type="phoneXMark" />
			</Button>
		</Tooltip>
	)
}
