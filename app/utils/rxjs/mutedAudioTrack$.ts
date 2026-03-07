import { Observable } from 'rxjs'
import { getGlobalAudioContext } from '../audioContextManager'

export const mutedAudioTrack$ = new Observable<MediaStreamTrack>(
	(subscriber) => {
		const audioContext = getGlobalAudioContext()
		const destination = audioContext.createMediaStreamDestination()
		const track = destination.stream.getAudioTracks()[0]
		subscriber.next(track)
		return () => {
			track.stop()
			destination.disconnect()
		}
	}
)
