import React, { forwardRef, useEffect, useRef } from 'react'
import { cn } from '~/utils/style'

export type VideoSrcObjectProps = Omit<
	React.JSX.IntrinsicElements['video'],
	'ref'
> & {
	videoTrack?: MediaStreamTrack
	// 低延迟模式：用于屏幕共享等需要降低延迟的场景
	lowLatency?: boolean
}

export const VideoSrcObject = forwardRef<HTMLVideoElement, VideoSrcObjectProps>(
	({ videoTrack, className, lowLatency = false, ...rest }, ref) => {
		const internalRef = useRef<HTMLVideoElement | null>(null)

		useEffect(() => {
			// 防御性检查：确保代码只在客户端浏览器环境中运行
			if (typeof window === 'undefined') return

			const video = internalRef.current
			if (!video) return

			if (!videoTrack) {
				video.srcObject = null
				return
			}

			// Create a stream for the track
			const mediaStream = new MediaStream([videoTrack])
			video.srcObject = mediaStream

			// 低延迟模式配置
			if (lowLatency) {
				// 设置播放速率略高于1，帮助快速追上实时流
				video.playbackRate = 1.0
			}

			// Explicitly call play. In many browsers, autoplay attribute
			// is not enough when the element is moved in the DOM.
			video.play().catch((err) => {
				// We can ignore AbortError as it's common during rapid re-renders
				if (err.name !== 'AbortError') {
					console.warn('Video playback failed:', err)
				}
			})

			return () => {
				// 清理函数：只清空 srcObject，不停止 track
				// track 的生命周期由外部管理（partytracks），不应该在这里停止
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
