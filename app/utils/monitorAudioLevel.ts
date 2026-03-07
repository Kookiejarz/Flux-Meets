export default function monitorAudioLevel({
	mediaStreamTrack,
	onMeasure,
	intervalMs = 1000 / 60, // default should land us near 60fps
}: {
	mediaStreamTrack: MediaStreamTrack
	onMeasure: (value: number) => void
	intervalMs?: number
}) {
	let timeout = -1
	let interval = -1
	
	// Check if track is valid before creating AudioContext
	if (!mediaStreamTrack || mediaStreamTrack.readyState !== 'live') {
		console.warn('⚠️ monitorAudioLevel: track is not live', {
			hasTrack: !!mediaStreamTrack,
			readyState: mediaStreamTrack?.readyState,
		})
		return () => {} // Return no-op cleanup
	}

	const audioContext = new AudioContext()
	
	// On mobile, AudioContext may start in 'suspended' state. Resume it.
	if (audioContext.state === 'suspended') {
		console.log('🎵 AudioContext suspended, attempting to resume...')
		audioContext.resume().catch((err) => {
			console.error('Failed to resume AudioContext:', err)
		})
	}
	
	const stream = new MediaStream()
	stream.addTrack(mediaStreamTrack)
	
	try {
		const mediaStreamAudioSourceNode =
			audioContext.createMediaStreamSource(stream)
		const analyserNode = audioContext.createAnalyser()
		mediaStreamAudioSourceNode.connect(analyserNode)
		// Since we just need a rough approximation and will be measuring
		// frequently, we want to drop this down from the default of 2048
		analyserNode.fftSize = 32

		const pcmData = new Float32Array(analyserNode.fftSize)
		let peak = 0

		interval = window.setInterval(() => {
			onMeasure(peak)
			peak = 0
		}, intervalMs)

		const tick = () => {
			timeout = window.setTimeout(() => {
				analyserNode.getFloatTimeDomainData(pcmData)
				let sumSquares = 0.0
				for (const amplitude of pcmData) {
					sumSquares += amplitude * amplitude
				}
				const current = Math.sqrt(sumSquares / pcmData.length)
				if (current > peak) {
					peak = current
				}
				tick()
			})
		}
		tick()

		return () => {
			mediaStreamAudioSourceNode.disconnect()
			analyserNode.disconnect()
			audioContext.close()
			clearInterval(interval)
			clearTimeout(timeout)
			stream.removeTrack(mediaStreamTrack)
		}
	} catch (error) {
		console.error('❌ Failed to create audio monitoring pipeline:', error)
		audioContext.close()
		return () => {}
	}
}
