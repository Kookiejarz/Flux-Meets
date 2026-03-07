import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useObservableAsValue } from 'partytracks/react'
import React, {
	forwardRef,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { Flipped } from 'react-flip-toolkit'
import { combineLatest, fromEvent, map, of, switchMap } from 'rxjs'
import { useDeadPulledTrackMonitor } from '~/hooks/useDeadPulledTrackMonitor'
import useIsSpeaking from '~/hooks/useIsSpeaking'
import { useRoomContext } from '~/hooks/useRoomContext'
import { screenshareSuffix } from '~/hooks/useStageManager'
import { useUserMetadata } from '~/hooks/useUserMetadata'
import { useVideoDimensions } from '~/hooks/useVideoDimensions'
import type { User } from '~/types/Messages'
import isNonNullable from '~/utils/isNonNullable'
import populateTraceLink from '~/utils/populateTraceLink'
import { ewma } from '~/utils/rxjs/ewma'
import { getPacketLoss$ } from '~/utils/rxjs/getPacketLoss$'
import { cn } from '~/utils/style'
import { usePulledVideoTrack } from '../hooks/usePulledVideoTrack'
import { AudioGlow } from './AudioGlow'
import { AudioIndicator } from './AudioIndicator'
import { CaptionDisplay } from './CaptionDisplay'
import {
	ConnectionIndicator,
	getConnectionQuality,
} from './ConnectionIndicator'
import { HoverFade } from './HoverFade'
import { Icon } from './Icon/Icon'
import { MuteUserButton } from './MuteUserButton'
import { OptionalLink } from './OptionalLink'
import { usePulledAudioTrack } from './PullAudioTracks'
import { Spinner } from './Spinner'
import { Tooltip } from './Tooltip'
import { VideoSrcObject } from './VideoSrcObject'

function useMid(track?: MediaStreamTrack) {
	const { partyTracks } = useRoomContext()
	const transceivers$ = useMemo(
		() =>
			combineLatest([
				partyTracks.peerConnection$,
				partyTracks.peerConnection$.pipe(
					switchMap((peerConnection) => fromEvent(peerConnection, 'track'))
				),
			]).pipe(map(([pc]) => pc.getTransceivers())),
		[partyTracks.peerConnection$]
	)
	const transceivers = useObservableAsValue(transceivers$, [])
	if (!track) return null
	return transceivers.find(
		(t) => t.sender.track === track || t.receiver.track === track
	)?.mid
}

interface Props {
	user: User
}

export const Participant = forwardRef<
	HTMLDivElement,
	React.JSX.IntrinsicElements['div'] & Props
>(({ user, style }, ref) => {
	const { data } = useUserMetadata(user.name)
	const {
		traceLink,
		partyTracks,
		dataSaverMode,
		simulcastEnabled,
		audioOnlyMode,
		pinnedTileIds,
		showDebugInfo,
		userMedia,
		room,
		room: { identity },
	} = useRoomContext()
	const peerConnection = useObservableAsValue(partyTracks.peerConnection$)
	const id = user.id
	const isSelf = identity && id.startsWith(identity.id)
	const isScreenShare = id.endsWith(screenshareSuffix)
	const ownerUserId = isScreenShare
		? id.slice(0, -screenshareSuffix.length)
		: id
	const shouldShowCaptionsOnThisTile =
		!user.tracks.screenShareEnabled || isScreenShare
	const isAi = user.id === 'ai'
	const aiAudioTrack = usePulledAudioTrack(isAi ? user.tracks.audio : undefined)
	const isSpeaking =
		useIsSpeaking(user.id === 'ai' ? aiAudioTrack : undefined) || user.speaking
	const pulledAudioTrack = usePulledAudioTrack(
		isScreenShare ? undefined : user.tracks.audio
	)
	const shouldPullVideo = isScreenShare || (!isSelf && !audioOnlyMode)
	let preferredRid: string | undefined = undefined
	if (simulcastEnabled) {
		// 屏幕共享和摄像头都支持自适应分层
		if (isScreenShare) {
			// 屏幕共享默认优先高质量，省流模式降级
			preferredRid = dataSaverMode ? 'b' : ''
		} else {
			// If datasaver mode is off, we want server-side bandwidth estimation and switching
			// so we will specify empty string to indicate we have no preferredRid
			preferredRid = dataSaverMode ? 'b' : ''
		}
	}
	const pulledVideoTrack = usePulledVideoTrack(
		shouldPullVideo ? user.tracks.video : undefined,
		preferredRid
	)
	const audioTrack = isSelf ? userMedia.audioStreamTrack : pulledAudioTrack
	const videoTrack =
		isSelf && !isScreenShare ? userMedia.videoStreamTrack : pulledVideoTrack

	useDeadPulledTrackMonitor(
		user.tracks.video,
		identity?.transceiverSessionId,
		!!user.tracks.video,
		videoTrack,
		user.name
	)

	useDeadPulledTrackMonitor(
		user.tracks.audio,
		identity?.transceiverSessionId,
		!!user.tracks.audio,
		audioTrack,
		user.name
	)

	const pinned = pinnedTileIds.includes(id)

	const packetLoss$ = useMemo(
		() =>
			getPacketLoss$(
				partyTracks.peerConnection$,
				of([audioTrack, videoTrack].filter(isNonNullable))
			).pipe(ewma(5000)),
		[audioTrack, partyTracks.peerConnection$, videoTrack]
	)

	const packetLoss = useObservableAsValue(packetLoss$, 0)

	const videoRef = useRef<HTMLVideoElement>(null)
	const { videoHeight, videoWidth } = useVideoDimensions(
		videoRef as React.RefObject<HTMLVideoElement>
	)

	const audioMid = useMid(audioTrack)
	const videoMid = useMid(videoTrack)

	const [captions, setCaptions] = useState<
		Array<{
			id: string
			text: string
			isFinal: boolean
			timestamp: number
		}>
	>([])

	const {
		displayCaptionLanguage,
		captionFadeStartMs,
		captionRemoveMs,
		captionCleanupIntervalMs,
	} = useRoomContext()

	// 预编译正则表达式和缓存函数（避免重复创建）
	const langTagRegex = /^\[([A-Z]{2})\]\s/

	// 检测浏览器语言：优先使用 navigator.languages 列表，并在可用时优先非英文语言
	const getBrowserLanguage = useCallback((): string => {
		const normalized =
			navigator.languages
				?.map((lang) => lang.toLowerCase().split('-')[0])
				.filter(Boolean) ?? []

		if (normalized.length === 0) {
			const fallback = (navigator.language || 'en').toLowerCase().split('-')[0]
			return fallback || 'en'
		}

		const preferredNonEnglish = normalized.find((lang) => lang !== 'en')
		return preferredNonEnglish || normalized[0]
	}, [])

	const shouldDisplayCaption = useCallback(
		(text: string): boolean => {
			if (displayCaptionLanguage === 'all') return true

			const langMatch = text.match(langTagRegex)
			const isOriginalCaption = !langMatch

			if (displayCaptionLanguage === 'original') {
				return isOriginalCaption
			}

			// 如果是 'auto' 模式，根据浏览器语言进行过滤
			let effectiveLanguage: string = displayCaptionLanguage
			if (effectiveLanguage === 'auto') {
				// AUTO 下保留原文，避免无 [EN]/[ZH] 标签时字幕不显示
				if (isOriginalCaption) return true
				effectiveLanguage = getBrowserLanguage()
			}

			if (langMatch) {
				const lang = langMatch[1].toLowerCase()
				return lang === effectiveLanguage
			}

			// 没有语言标签的原文字幕，总是显示（除了'original'模式已在上面处理）
			return isOriginalCaption
		},
		[displayCaptionLanguage, getBrowserLanguage]
	)

	const normalizeCaptionText = useCallback((text: string) => {
		return text
			.toLowerCase()
			.replace(langTagRegex, '')
			.replace(/[\s\p{P}\p{S}]/gu, '')
			.trim()
	}, [])

	const isSimilarCaptionText = useCallback(
		(a: string, b: string) => {
			const na = normalizeCaptionText(a)
			const nb = normalizeCaptionText(b)
			if (!na || !nb) return false
			if (na === nb) return true

			const minLen = Math.min(na.length, nb.length)
			if (minLen < 6) return false

			return na.startsWith(nb) || nb.startsWith(na) || na.includes(nb) || nb.includes(na)
		},
		[normalizeCaptionText]
	)

	// 缓存的清理逻辑
	const cleanupCaptions = useCallback((prev: typeof captions) => {
		const now = Date.now()
		// 只在有过期字幕时才执行清理（给淡出动画留足时间）
		const needsCleanup = prev.some((c) => now - c.timestamp > captionRemoveMs)
		if (!needsCleanup) return prev

		return prev.filter((caption) => {
			// 保留未完成和未超时的字幕
			return now - caption.timestamp < captionRemoveMs
		})
	}, [captionRemoveMs])

	useEffect(() => {
		if (!shouldShowCaptionsOnThisTile && captions.length > 0) {
			setCaptions([])
		}
	}, [shouldShowCaptionsOnThisTile, captions.length])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const data = JSON.parse(event.data)
			if (data.type === 'caption') {
				// 只显示属于这个用户的字幕
				const isThisUser = data.userId === ownerUserId

				if (
					isThisUser &&
					shouldShowCaptionsOnThisTile &&
					shouldDisplayCaption(data.text)
				) {
					setCaptions((prev) => {
						const now = Date.now()
						const incomingText = String(data.text ?? '').trim()
						if (!incomingText) return prev

						let lastUnfinishedIndex = -1
						for (let i = prev.length - 1; i >= 0; i--) {
							if (!prev[i].isFinal) {
								lastUnfinishedIndex = i
								break
							}
						}

						// 有未完成字幕时：
						// - partial 一定更新它
						// - final 只有文本相似才收口，避免把下一句正在生成的字幕误改掉
						if (lastUnfinishedIndex !== -1) {
							const activeUnfinished = prev[lastUnfinishedIndex]

							if (
								!data.isFinal ||
								isSimilarCaptionText(activeUnfinished.text, incomingText)
							) {
								const updated = [...prev]
								updated[lastUnfinishedIndex] = {
									...activeUnfinished,
									text: incomingText,
									isFinal: data.isFinal,
									timestamp: now,
								}

								if (lastUnfinishedIndex !== updated.length - 1) {
									const [unfinished] = updated.splice(lastUnfinishedIndex, 1)
									updated.push(unfinished)
								}

								return updated.length > 2 ? updated.slice(-2) : updated
							}

							// final 与当前 unfinished 不相似：视为迟到包，忽略，保持当前生成字幕在底部
							if (data.isFinal) {
								const lastFinal = [...prev].reverse().find((c) => c.isFinal)
								if (lastFinal && isSimilarCaptionText(lastFinal.text, incomingText)) {
									return prev
								}
								return prev
							}
						}

						const lastCaption = prev[prev.length - 1]
						if (
							data.isFinal &&
							lastCaption?.isFinal &&
							isSimilarCaptionText(lastCaption.text, incomingText)
						) {
							const updated = [...prev]
							updated[updated.length - 1] = {
								...lastCaption,
								text:
									incomingText.length >= lastCaption.text.length
										? incomingText
										: lastCaption.text,
								timestamp: now,
							}
							return updated
						}

						// 完成字幕或第一条未完成字幕：添加新字幕
						const newCaption = {
							id: `${id}-${now}-${Math.random()}`,
							text: incomingText,
							isFinal: data.isFinal,
							timestamp: now,
						}

						const updated = [...prev, newCaption]
						return updated.length > 2 ? updated.slice(-2) : updated
					})
				}
			}
		}

		// 更平滑的清理节奏：让淡出动画有机会渲染
		const cleanupTimer = setInterval(() => {
			setCaptions((prev) => cleanupCaptions(prev))
		}, captionCleanupIntervalMs)

		const socket = room.websocket
		socket.addEventListener('message', handleMessage)

		return () => {
			socket.removeEventListener('message', handleMessage)
			clearInterval(cleanupTimer)
		}
	}, [
		ownerUserId,
		isSelf,
		identity?.id,
		shouldShowCaptionsOnThisTile,
		shouldDisplayCaption,
		isSimilarCaptionText,
		cleanupCaptions,
		captionCleanupIntervalMs,
		room.websocket,
	])

	return (
		<div
			className="grow shrink text-base basis-[calc(var(--flex-container-width)_-_var(--gap)_*_3)]"
			ref={ref}
			style={style}
			translate="no"
		>
			<Flipped flipId={id + pinned}>
				<div
					className={cn(
						'h-full mx-auto overflow-hidden text-white opacity-0 animate-fadeIn',
						'relative max-w-[--participant-max-width] rounded-xl bg-zinc-800/50 ring-1 ring-white/10'
					)}
				>
					{shouldShowCaptionsOnThisTile && captions.length > 0 && (
						<CaptionDisplay
							captions={captions}
							userId={user.id}
							fadeStartMs={captionFadeStartMs}
						/>
					)}
					{!isScreenShare && !user.tracks.videoEnabled && (
						<div
							className={cn(
								'absolute inset-0 h-full w-full grid place-items-center'
							)}
						>
							<div className="h-[2em] w-[2em] grid place-items-center text-4xl md:text-6xl 2xl:text-8xl relative">
								{data?.photob64 ? (
									<div>
										<AudioGlow
											className="absolute inset-0 w-full h-full rounded-full"
											audioTrack={audioTrack}
											type="box"
										></AudioGlow>
										<img
											className="rounded-full"
											src={`data:image/png;base64,${data.photob64}`}
											alt={data.displayName}
										/>
									</div>
								) : (
									<span className="relative grid w-full h-full uppercase rounded-full place-items-center bg-zinc-700 shadow-inner">
										{isSpeaking && (
											<AudioGlow
												type="text"
												className="absolute uppercase"
												audioTrack={audioTrack}
											>
												{user.name.charAt(0)}
											</AudioGlow>
										)}
										{user.name.charAt(0)}
									</span>
								)}
							</div>
						</div>
					)}
					<VideoSrcObject
						ref={videoRef}
						className={cn(
							'absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity',
							isSelf && !isScreenShare && '-scale-x-100',
							!isScreenShare && 'object-cover',
							{
								'opacity-100': isScreenShare
									? user.tracks.screenShareEnabled
									: user.tracks.videoEnabled && (!audioOnlyMode || isSelf),
							},
							isSelf && isScreenShare && 'opacity-75'
						)}
						videoTrack={videoTrack}
						onDoubleClick={() => {
							// Double-click to toggle camera facing on mobile (only for self view)
							if (isSelf && !isScreenShare) {
								userMedia.toggleCameraFacing()
							}
						}}
					/>
					{/* Only show spinner when user has video enabled but track hasn't arrived yet */}
					{shouldPullVideo && user.tracks.videoEnabled && user.tracks.video && !pulledVideoTrack && (
						<div className="absolute inset-0 grid w-full h-full place-items-center">
							<Spinner className="h-8 w-8" />
						</div>
					)}
					<HoverFade className="absolute inset-0 grid w-full h-full place-items-center">
						<div className="flex gap-2 p-2 rounded bg-zinc-900/30">
							{!isScreenShare && (
								<MuteUserButton
									displayType="ghost"
									mutedDisplayType="ghost"
									user={user}
								/>
							)}
						</div>
					</HoverFade>
					{!isScreenShare && (
						<div className="absolute left-3 top-3 bg-black/40 backdrop-blur-md p-1.5 rounded-md">
							{/* Show audio indicator when speaking, regardless of video state */}
							{audioTrack &&
								user.tracks.audioEnabled &&
								isSpeaking && <AudioIndicator audioTrack={audioTrack} />}

							{!user.tracks.audioEnabled && !user.tracks.audioUnavailable && (
								<Tooltip content="Mic is turned off">
									<div>
										<Icon type="micOff" className="w-4 h-4 text-white" />
										<VisuallyHidden>Mic is muted</VisuallyHidden>
									</div>
								</Tooltip>
							)}
							{user.tracks.audioUnavailable && (
								<Tooltip content="Mic is unavailable. User cannot unmute.">
									<div>
										<Icon type="micOff" className="w-4 h-4 text-red-400" />
										<VisuallyHidden>Mic is muted</VisuallyHidden>
									</div>
								</Tooltip>
							)}
						</div>
					)}
					{data?.displayName && user.transceiverSessionId && (
						<div className="flex items-center gap-2 absolute m-3 left-0 bottom-0 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg text-sm font-medium">
							<ConnectionIndicator quality={getConnectionQuality(packetLoss)} />
							<OptionalLink
								className="leading-none text-white/90"
								href={populateTraceLink(user.transceiverSessionId, traceLink)}
								target="_blank"
								rel="noopener noreferrer"
							>
								{data.displayName}
								{showDebugInfo && peerConnection && (
									<span className="opacity-50 font-normal">
										{' '}
										{[
											audioMid && `audio mid: ${audioMid}`,
											videoMid && `video mid: ${videoMid}`,
											`vid size: ${videoWidth}x${videoHeight}`,
											!isSelf &&
												preferredRid &&
												`preferredRid: ${preferredRid}`,
										]
											.filter(Boolean)
											.join(' ')}
									</span>
								)}
							</OptionalLink>
						</div>
					)}
					<div className="absolute top-0 right-0 flex gap-4 p-3">
						{user.raisedHand && !isScreenShare && (
							<Tooltip content="Hand is raised">
								<div className="relative bg-orange-500/20 backdrop-blur-md p-1.5 rounded-md text-orange-400">
									<div className="relative">
										<Icon className="w-5 h-5" type="handRaised" />
										<Icon
											className="absolute top-0 left-0 w-5 h-5 animate-ping"
											type="handRaised"
										/>
										<VisuallyHidden>Hand is raised</VisuallyHidden>
									</div>
								</div>
							</Tooltip>
						)}
					</div>
					{(isSpeaking || user.raisedHand) && !isScreenShare && (
						<div
							className={cn(
								'pointer-events-none absolute inset-0 h-full w-full ring-4 ring-inset ring-orange-500',
								!pinned && 'rounded-xl'
							)}
						></div>
					)}
				</div>
			</Flipped>
		</div>
	)
})

Participant.displayName = 'Participant'
