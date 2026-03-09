import type { FC } from 'react'
import useMediaDevices from '~/hooks/useMediaDevices'
import { useRoomContext } from '~/hooks/useRoomContext'
import { errorMessageMap } from '~/hooks/useUserMedia'
import { Option, Select } from './Select'

export const AudioInputSelector: FC<{ id?: string }> = ({ id }) => {
	const audioInputDevices = useMediaDevices((d) => d.kind === 'audioinput')

	const {
		userMedia: { audioUnavailableReason, audioDeviceId, setAudioDeviceId },
	} = useRoomContext()

	if (audioUnavailableReason) {
		return (
			<div className="max-w-[40ch]">
				<Select
					tooltipContent={errorMessageMap[audioUnavailableReason]}
					id={id}
					defaultValue="unavailable"
				>
					<Option value={'unavailable'}>(Unavailable)</Option>
				</Select>
			</div>
		)
	}

	const hasSelectedAudioDevice = audioInputDevices.some(
		(d) => d.deviceId === audioDeviceId
	)
	const selectedAudioDeviceId = hasSelectedAudioDevice
		? audioDeviceId
		: audioInputDevices[0]?.deviceId ?? 'unavailable'
	const audioDevicesAvailable = audioInputDevices.length > 0

	return (
		<div className="max-w-[40ch]">
			<Select
				id={id}
				value={selectedAudioDeviceId}
				onValueChange={(value) => {
					if (value === 'unavailable') return
					setAudioDeviceId(value)
				}}
				disabled={!audioDevicesAvailable}
			>
				{!audioDevicesAvailable && (
					<Option value="unavailable">(Unavailable)</Option>
				)}
				{audioInputDevices.map((d) => (
					<Option key={d.deviceId} value={d.deviceId}>
						{d.label || 'Default Microphone'}
					</Option>
				))}
			</Select>
		</div>
	)
}
