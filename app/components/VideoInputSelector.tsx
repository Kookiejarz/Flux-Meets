import { type FC } from 'react'
import useMediaDevices from '~/hooks/useMediaDevices'
import { useRoomContext } from '~/hooks/useRoomContext'
import { errorMessageMap } from '~/hooks/useUserMedia'
import { Option, Select } from './Select'

export const VideoInputSelector: FC<{ id?: string }> = ({ id }) => {
	const videoInputDevices = useMediaDevices((d) => d.kind === 'videoinput')

	const {
		userMedia: { videoUnavailableReason, videoDeviceId, setVideoDeviceId },
	} = useRoomContext()

	if (videoUnavailableReason) {
		return (
			<div className="max-w-[40ch]">
				<Select
					tooltipContent={errorMessageMap[videoUnavailableReason]}
					id={id}
					defaultValue="unavailable"
				>
					<Option value={'unavailable'}>(Unavailable)</Option>
				</Select>
			</div>
		)
	}

	const hasSelectedVideoDevice = videoInputDevices.some(
		(d) => d.deviceId === videoDeviceId
	)
	const selectedVideoDeviceId = hasSelectedVideoDevice
		? videoDeviceId
		: videoInputDevices[0]?.deviceId

	return (
		<div className="max-w-[40ch]">
			<Select
				value={selectedVideoDeviceId}
				onValueChange={setVideoDeviceId}
				id={id}
			>
				{videoInputDevices.map((d) => (
					<Option key={d.deviceId} value={d.deviceId}>
						{d.label || 'Default Camera'}
					</Option>
				))}
			</Select>
		</div>
	)
}
