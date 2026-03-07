import { useEffect, useRef, useState } from 'react'

/**
 * Applies gain to a microphone audio track using Web Audio API
 * @param audioTrack - The MediaStreamTrack to apply gain to
 * @param gainValue - Volume level as percentage (100 = normal, 200 = 2x boost)
 * @returns A new MediaStreamTrack with gain applied, or undefined if no track
 */
export function useMicrophoneGain(
	audioTrack: MediaStreamTrack | undefined,
	gainValue: number
): MediaStreamTrack | undefined {
	const [outputTrack, setOutputTrack] = useState<MediaStreamTrack>()
	const audioContextRef = useRef<AudioContext | null>(null)
	const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
	const gainNodeRef = useRef<GainNode | null>(null)

	// Create/destroy audio graph based on track and whether gain is needed
	useEffect(() => {
		// If no audio track, clean up and return
		if (!audioTrack || audioTrack.readyState !== 'live') {
			// Clean up previous audio graph
			if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
				sourceNodeRef.current?.disconnect()
				gainNodeRef.current?.disconnect()
				audioContextRef.current.close()
			}
			audioContextRef.current = null
			sourceNodeRef.current = null
			gainNodeRef.current = null
			setOutputTrack(undefined)
			return
		}

		// If gain is 100% (no processing needed), clean up and return original track
		if (gainValue === 100) {
			// Clean up any existing audio graph
			if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
				sourceNodeRef.current?.disconnect()
				gainNodeRef.current?.disconnect()
				audioContextRef.current.close()
			}
			audioContextRef.current = null
			sourceNodeRef.current = null
			gainNodeRef.current = null
			setOutputTrack(audioTrack)
			return
		}

		// Only create audio graph if it doesn't exist
		// This prevents recreation when gainValue changes
		if (!audioContextRef.current) {
			// Create audio context and nodes
			const audioContext = new AudioContext()
			const sourceStream = new MediaStream([audioTrack])
			const sourceNode = audioContext.createMediaStreamSource(sourceStream)
			const gainNode = audioContext.createGain()
			const destination = audioContext.createMediaStreamDestination()

			// Set initial gain (convert percentage to linear gain)
			gainNode.gain.value = gainValue / 100

			// Connect: source -> gain -> destination
			sourceNode.connect(gainNode)
			gainNode.connect(destination)

			// Store refs
			audioContextRef.current = audioContext
			sourceNodeRef.current = sourceNode
			gainNodeRef.current = gainNode

			// Get output track
			const newOutputTrack = destination.stream.getAudioTracks()[0]
			if (newOutputTrack) {
				setOutputTrack(newOutputTrack)
			}
		}

		return () => {
			if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
				sourceNodeRef.current?.disconnect()
				gainNodeRef.current?.disconnect()
				audioContextRef.current.close()
			}
			audioContextRef.current = null
			sourceNodeRef.current = null
			gainNodeRef.current = null
		}
	}, [audioTrack, gainValue])

	// Update gain smoothly when value changes (only if audio graph exists)
	useEffect(() => {
		if (!gainNodeRef.current || !audioContextRef.current || gainValue === 100) {
			return
		}

		// Use setTargetAtTime for smooth volume changes
		const now = audioContextRef.current.currentTime
		gainNodeRef.current.gain.setTargetAtTime(gainValue / 100, now, 0.015)
	}, [gainValue])

	return outputTrack
}
