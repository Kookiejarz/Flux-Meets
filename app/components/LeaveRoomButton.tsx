import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useNavigate } from '@remix-run/react'
import type { FC } from 'react'
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
	return (
		<Tooltip content="Leave">
			<Button
				displayType="danger"
				className={className}
				onClick={() => {
					console.log(
						'Leave Button Clicked - meetingId:',
						meetingId,
						'hasDb:',
						navigateToFeedbackPage
					)
					// Stop all media devices before leaving
					mic.stopBroadcasting()
					camera.stopBroadcasting()
					screenshare.stopBroadcasting()

					const params = new URLSearchParams()
					if (meetingId) {
						// best-effort mark meeting ended using client timestamp
						const body = new URLSearchParams({ meetingId })
						fetch('/api/meeting-end', { method: 'POST', body }).catch(() => {})
						params.set('meetingId', meetingId)
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
