import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useKey } from 'react-use'
import useIsSpeaking from '~/hooks/useIsSpeaking'
import { useRoomContext } from '~/hooks/useRoomContext'
import { errorMessageMap } from '~/hooks/useUserMedia'
import { metaKey } from '~/utils/metaKey'
import type { ButtonProps } from './Button'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

export const MicButton: FC<
	ButtonProps & {
		warnWhenSpeakingWhileMuted?: boolean
	}
> = ({ onClick, warnWhenSpeakingWhileMuted, ...rest }) => {
	const {
		userMedia: {
			turnMicOn,
			turnMicOff,
			audioEnabled,
			audioUnavailableReason,
			audioMonitorStreamTrack,
		},
	} = useRoomContext()

	const toggle = () => {
		audioEnabled ? turnMicOff() : turnMicOn()
	}

	useKey((e) => {
		if (e.key === 'd' && e.metaKey) {
			e.preventDefault()
			return true
		}
		return false
	}, toggle)

	const isSpeaking = useIsSpeaking(audioMonitorStreamTrack)
	const [showMutedWarning, setShowMutedWarning] = useState(false)

	useEffect(() => {
		if (isSpeaking && !audioEnabled && warnWhenSpeakingWhileMuted) {
			setShowMutedWarning(true)
			const timer = setTimeout(() => {
				setShowMutedWarning(false)
			}, 2000)
			return () => clearTimeout(timer)
		}

		if (audioEnabled) {
			setShowMutedWarning(false)
		}
	}, [isSpeaking, audioEnabled, warnWhenSpeakingWhileMuted])

	const audioUnavailableMessage = audioUnavailableReason
		? errorMessageMap[audioUnavailableReason]
		: null

	return (
		<>
			{showMutedWarning && (
				<div className="fixed top-4 right-4 z-[120] bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-3 text-zinc-100 pointer-events-auto">
					<div className="flex items-center gap-2 py-0.5">
						<Icon type="micOff" className="text-orange-500 h-4 w-4" />
						<span className="font-bold text-xs whitespace-nowrap">
							Talking while muted?
						</span>
						<button
							onClick={() => {
								toggle()
								setShowMutedWarning(false)
							}}
							className="ml-2 bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-2 py-1 rounded-md font-bold transition-colors"
						>
							UNMUTE
						</button>
					</div>
				</div>
			)}
			<Tooltip
				content={
					audioUnavailableMessage
						? `${audioUnavailableMessage} (Click to retry)`
						: `Turn mic ${audioEnabled ? 'off' : 'on'} (${metaKey}D)`
				}
			>
				<Button
					displayType={
						audioUnavailableReason
							? 'danger'
							: audioEnabled
								? 'secondary'
								: 'danger'
					}
					onClick={(e) => {
						toggle()
						onClick && onClick(e)
					}}
					{...rest}
				>
					<VisuallyHidden>
						{audioEnabled ? 'Turn mic off' : 'Turn mic on'}
					</VisuallyHidden>
					<Icon type={audioEnabled ? 'micOn' : 'micOff'} />
				</Button>
			</Tooltip>
		</>
	)
}
