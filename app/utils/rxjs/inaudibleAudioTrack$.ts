import { Observable } from 'rxjs'
import { getGlobalAudioContext } from '../audioContextManager'

export const inaudibleAudioTrack$ = new Observable<MediaStreamTrack>(
	(subscriber) => {
		const audioContext = getGlobalAudioContext()
		
		// Ensure the context is running
		if (audioContext.state === 'suspended') {
			audioContext.resume().catch(() => {})
		}

		const oscillator = audioContext.createOscillator()
		oscillator.type = 'triangle'
		// roughly sounds like a box fan
		oscillator.frequency.setValueAtTime(20, audioContext.currentTime)

		const gainNode = audioContext.createGain()
		// even w/ gain at 0 some packets are sent
		gainNode.gain.setValueAtTime(0, audioContext.currentTime)

		oscillator.connect(gainNode)

		const destination = audioContext.createMediaStreamDestination()
		gainNode.connect(destination)

		oscillator.start()

		const track = destination.stream.getAudioTracks()[0]

		subscriber.next(track)
		return () => {
			track.stop()
			oscillator.stop()
			oscillator.disconnect()
			gainNode.disconnect()
			destination.disconnect()
		}
	}
)
