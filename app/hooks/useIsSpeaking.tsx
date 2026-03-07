import { useEffect, useRef, useState } from 'react'
import monitorAudioLevel from '~/utils/monitorAudioLevel'

export default function useIsSpeaking(mediaStreamTrack?: MediaStreamTrack) {
	const [isSpeaking, setIsSpeaking] = useState(false)

	// the audio level is monitored very rapidly, and we don't want
	// react involved in tracking the state because it causes way
	// too many re-renders. To work around this, we use the isSpeakingRef
	// to track the state and then sync it using another effect
	const isSpeakingRef = useRef(isSpeaking)

	// this effect syncs the state on a 50ms interval
	useEffect(() => {
		if (!mediaStreamTrack) return
		isSpeakingRef.current = isSpeaking
		const interval = window.setInterval(() => {
			// state is already in sync — do nothing
			if (isSpeaking === isSpeakingRef.current) {
				return
			}

			// sync state
			setIsSpeaking(isSpeakingRef.current)
		}, 50)
		return () => {
			clearInterval(interval)
		}
	}, [isSpeaking, mediaStreamTrack])

	useEffect(() => {
		if (!mediaStreamTrack) return
		let timeout = -1
		const cleanup = monitorAudioLevel({
			mediaStreamTrack,
			onMeasure: (vol) => {
				// Lower threshold for better sensitivity to normal conversation
				// Initial: 0.035 (normal speaking), Sustained: 0.015 (lower for speech patterns)
				const threshold = isSpeakingRef.current ? 0.015 : 0.035
				const audioLevelAboveThreshold =
					// once the user has been determined to be speaking, we want
					// to lower the threshold because speech patterns don't always
					// stay consistently high
					vol > threshold
				if (audioLevelAboveThreshold) {
					// user is still speaking, clear timeout & reset
					clearTimeout(timeout)
					timeout = -1
					// track state
					isSpeakingRef.current = true
				} else if (timeout === -1) {
					// user is not speaking and timeout is not set
					timeout = window.setTimeout(() => {
						isSpeakingRef.current = false
						// reset timeout
						timeout = -1
					}, 800)
				}
			},
		})

		return () => {
			cleanup()
		}
		// Only re-run when track changes, not when isSpeaking state changes
		// (we use isSpeakingRef internally to avoid unnecessary re-creates)
	}, [mediaStreamTrack])

	return isSpeaking
}
