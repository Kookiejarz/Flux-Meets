import React, { forwardRef, useEffect, useRef } from 'react'
import { cn } from '~/utils/style'

export type VideoSrcObjectProps = Omit<
	React.JSX.IntrinsicElements['video'],
	'ref'
> & {
	videoTrack?: MediaStreamTrack
}

export const VideoSrcObject = forwardRef<HTMLVideoElement, VideoSrcObjectProps>(
	({ videoTrack, className, ...rest }, ref) => {
		const internalRef = useRef<HTMLVideoElement | null>(null)

		useEffect(() => {
			const video = internalRef.current
			if (!video) return

			if (!videoTrack) {
				video.srcObject = null
				return
			}

			// Create a stream for the track
			const mediaStream = new MediaStream([videoTrack])
			video.srcObject = mediaStream

			// Explicitly call play. In many browsers, autoplay attribute 
			// is not enough when the element is moved in the DOM.
			video.play().catch((err) => {
				// We can ignore AbortError as it's common during rapid re-renders
				if (err.name !== 'AbortError') {
					console.warn('Video playback failed:', err)
				}
			})

			return () => {
				// Use the captured video element to ensure cleanup even if internalRef.current changes
				video.srcObject = null
			}
		}, [videoTrack])

		return (
			<video
				className={cn('bg-zinc-700', className)}
				ref={(v) => {
					internalRef.current = v
					if (typeof ref === 'function') {
						ref(v)
					} else if (ref) {
						ref.current = v
					}
				}}
				autoPlay
				playsInline
				muted // Always mute video elements since audio is handled separately
				{...rest}
			/>
		)
	}
)

VideoSrcObject.displayName = 'VideoSrcObject'
