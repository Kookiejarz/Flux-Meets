import { useObservableAsValue } from 'partytracks/react'
import type { FC } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { of } from 'rxjs'
import { useRoomContext } from '~/hooks/useRoomContext'

interface AudioStreamProps {
	tracksToPull: string[]
	onTrackAdded: (id: string, track: MediaStreamTrack) => void
	onTrackRemoved: (id: string, track: MediaStreamTrack) => void
}

export const AudioStream: FC<AudioStreamProps> = ({
	tracksToPull,
	onTrackAdded,
	onTrackRemoved,
}) => {
	const mediaStreamRef = useRef(new MediaStream())
	const ref = useRef<HTMLAudioElement>(null)

	const tryPlay = () => {
		const audio = ref.current
		if (!audio) return
		audio.play().catch(() => {
			// Mobile browsers may block autoplay until user gesture.
			// We retry on next gesture in the effect below.
		})
	}

	useEffect(() => {
		const audio = ref.current
		if (!audio) return
		const mediaStream = mediaStreamRef.current
		audio.srcObject = mediaStream
		tryPlay()
	}, [])

	useEffect(() => {
		const unlock = () => {
			tryPlay()
		}

		document.addEventListener('touchstart', unlock, { passive: true })
		document.addEventListener('pointerdown', unlock, { passive: true })
		document.addEventListener('click', unlock, { passive: true })

		return () => {
			document.removeEventListener('touchstart', unlock)
			document.removeEventListener('pointerdown', unlock)
			document.removeEventListener('click', unlock)
		}
	}, [])

	const resetSrcObject = () => {
		const audio = ref.current
		const mediaStream = mediaStreamRef.current
		if (!audio || !mediaStream) return
		// need to set srcObject again in Chrome and call play() again for Safari
		// https://www.youtube.com/live/Tkx3OGrwVk8?si=K--P_AzNnAGrjraV&t=2533
		// calling play() this way to make Chrome happy otherwise it throws an error
		audio.addEventListener('canplay', tryPlay, { once: true })
		audio.srcObject = mediaStream
		tryPlay()
	}

	return (
		<>
			<audio ref={ref} autoPlay playsInline />
			{tracksToPull.map((track) => (
				<AudioTrack
					key={track}
					track={track}
					mediaStream={mediaStreamRef.current}
					onTrackAdded={(metadata, track) => {
						onTrackAdded(metadata, track)
						resetSrcObject()
					}}
					onTrackRemoved={(metadata, track) => {
						onTrackRemoved(metadata, track)
						resetSrcObject()
					}}
				/>
			))}
		</>
	)
}

function AudioTrack({
	mediaStream,
	track,
	onTrackAdded,
	onTrackRemoved,
}: {
	mediaStream: MediaStream
	track: string
	onTrackAdded: (id: string, track: MediaStreamTrack) => void
	onTrackRemoved: (id: string, track: MediaStreamTrack) => void
}) {
	const onTrackAddedRef = useRef(onTrackAdded)
	onTrackAddedRef.current = onTrackAdded
	const onTrackRemovedRef = useRef(onTrackRemoved)
	onTrackRemovedRef.current = onTrackRemoved

	const { partyTracks } = useRoomContext()
	const trackObject = useMemo(() => {
		const [sessionId, trackName] = track.split('/')
		return {
			sessionId,
			trackName,
			location: 'remote',
		} as const
	}, [track])

	const pulledTrack$ = useMemo(() => {
		return partyTracks.pull(of(trackObject))
	}, [partyTracks, trackObject])

	const audioTrack = useObservableAsValue(pulledTrack$)

	useEffect(() => {
		if (!audioTrack) return
		mediaStream.addTrack(audioTrack)
		onTrackAddedRef.current(track, audioTrack)
		return () => {
			mediaStream.removeTrack(audioTrack)
			onTrackRemovedRef.current(track, audioTrack)
		}
	}, [audioTrack, mediaStream, track])

	return null
}
