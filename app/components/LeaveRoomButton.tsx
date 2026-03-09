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
	const { roomName } = useParams()
	const {
		room: {
			identity,
			otherUsers,
			roomState: { startTime },
		},
	} = useRoomContext()

	const participantSnapshot = Array.from(
		new Map(
			[identity, ...otherUsers]
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
					console.log(
						'Leave Button Clicked - meetingId:',
						meetingId,
						'hasDb:',
						navigateToFeedbackPage
					)
					// Stop all media devices before leaving
					console.log('📴 Stopping all media devices...')
					mic.stopBroadcasting()
					camera.stopBroadcasting()
						screenshare.stopBroadcasting()
						console.log('📴 All media devices stopped')

						const params = new URLSearchParams()
						if (meetingId) {
							// best-effort mark meeting ended using client timestamp
							const body = new URLSearchParams({ meetingId })
							fetch('/api/meeting-end', {
								method: 'POST',
								body,
								keepalive: true,
							}).catch(() => {})
							params.set('meetingId', meetingId)
							if (participantSnapshot.length > 0) {
								params.set('participants', JSON.stringify(participantSnapshot))
							}
							if (roomName) {
								params.set('roomName', roomName)
							}
							if (startTime) {
								params.set('startedAt', String(startTime))
							}
							params.set('endedAt', String(endedAt))
							params.set('userCount', String(participantSnapshot.length))
							navigate(`/summary?${params}`)
						} else {
							console.warn('No meetingId found, redirecting to home')
							navigate('/')
						}
				}}
			>
				<VisuallyHidden>Leave</VisuallyHidden>
				<Icon type="phoneXMark" />
			</Button>
		</Tooltip>
	)
}
