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
import { useDispatchToast } from './Toast'
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
	onParticipantClick?: (user: User) => void
}

export const Participant = forwardRef<
	HTMLDivElement,
	React.JSX.IntrinsicElements['div'] & Props
>(({ user, style, onParticipantClick }, ref) => {
	const { data } = useUserMetadata(user.name)
	const rawDisplayName = data?.displayName?.trim()
	const displayName =
		rawDisplayName &&
		rawDisplayName.toLowerCase() !== 'undefined undefined' &&
		rawDisplayName.toLowerCase() !== 'null null'
			? rawDisplayName
			: user.name
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
		e2eeSafetyNumber,
		e2eeStatus,
		room: { identity },
	} = useRoomContext()
	const dispatchToast = useDispatchToast()
	const peerConnection = useObservableAsValue(partyTracks.peerConnection$)
	const id = user.id
	const isSelf = identity && id.startsWith(identity.id)
	const isScreenShare = id.endsWith(screenshareSuffix)
	const traceHref = user.transceiverSessionId
		? populateTraceLink(user.transceiverSessionId, traceLink)
		: undefined
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
	const audioTrack = isSelf ? userMedia.audioMonitorStreamTrack : pulledAudioTrack
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
	const isScreenshareClickable = isScreenShare && Boolean(onParticipantClick)

	const packetLoss$ = useMemo(
		() =>
			getPacketLoss$(
				partyTracks.peerConnection$,
				of([audioTrack, videoTrack].filter(isNonNullable))
			).pipe(ewma(5000)),
		[audioTrack, partyTracks.peerConnection$, videoTrack]
	)

	const packetLoss = useObservableAsValue(packetLoss$, 0)
	const [showInlineSafetyNumber, setShowInlineSafetyNumber] = useState(false)

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

		return normalized[0]
	}, [])

	const detectOriginalCaptionLanguage = useCallback(
		(text: string): string | null => {
			const normalized = text.trim()
			if (!normalized) return null

			const hanMatches = normalized.match(/\p{Script=Han}/gu) ?? []
			if (
				hanMatches.length >= Math.max(2, Math.floor(normalized.length * 0.15))
			) {
				return 'zh'
			}

			const latinMatches = normalized.match(/[A-Za-z]/g) ?? []
			if (
				latinMatches.length >= Math.max(3, Math.floor(normalized.length * 0.2))
			) {
				return 'en'
			}

			return null
		},
		[]
	)

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
				// AUTO 下自己只显示 STT 原文，不显示翻译
				if (isSelf) return isOriginalCaption
				effectiveLanguage = getBrowserLanguage()
			}

			if (langMatch) {
				const lang = langMatch[1].toLowerCase()
				return lang === effectiveLanguage
			}

			// AUTO 下：看别人发言时，如果原文检测语言与浏览器首选一致，则显示原文
			if (displayCaptionLanguage === 'auto' && isOriginalCaption) {
				const detectedLang = detectOriginalCaptionLanguage(text)
				return detectedLang === effectiveLanguage
			}

			// 显式语言过滤（en/zh）下，不显示无标签原文
			return false
		},
		[
			displayCaptionLanguage,
			getBrowserLanguage,
			isSelf,
			detectOriginalCaptionLanguage,
		]
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
			const langA = a.match(langTagRegex)?.[1] || 'original'
			const langB = b.match(langTagRegex)?.[1] || 'original'

			// 不同语言的字幕永不判定为“相似”，防止互相吞没
			if (langA !== langB) return false

			const na = normalizeCaptionText(a)
			const nb = normalizeCaptionText(b)
			if (!na || !nb) return false
			if (na === nb) return true

			const minLen = Math.min(na.length, nb.length)
			if (minLen < 6) return false

			return (
				na.startsWith(nb) ||
				nb.startsWith(na) ||
				na.includes(nb) ||
				nb.includes(na)
			)
		},
		[normalizeCaptionText]
	)

	// 缓存的清理逻辑
	const cleanupCaptions = useCallback(
		(prev: typeof captions) => {
			const now = Date.now()
			// 只在有过期字幕时才执行清理（给淡出动画留足时间）
			const needsCleanup = prev.some((c) => now - c.timestamp > captionRemoveMs)
			if (!needsCleanup) return prev

			return prev.filter((caption) => {
				// 保留未完成和未超时的字幕
				return now - caption.timestamp < captionRemoveMs
			})
		},
		[captionRemoveMs]
	)

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

						// 提取语言标签（如果有）
						const incomingLangMatch = incomingText.match(langTagRegex)
						const incomingLang = incomingLangMatch ? incomingLangMatch[1] : 'original'

						// 寻找属于同一种语言且未完成的字幕
						let lastMatchIndex = -1
						for (let i = prev.length - 1; i >= 0; i--) {
							const existingText = prev[i].text
							const existingLangMatch = existingText.match(langTagRegex)
							const existingLang = existingLangMatch ? existingLangMatch[1] : 'original'

							if (!prev[i].isFinal && existingLang === incomingLang) {
								lastMatchIndex = i
								break
							}
						}

						// 找到了同语言的未完成字幕：更新它
						if (lastMatchIndex !== -1) {
							const activeUnfinished = prev[lastMatchIndex]

							// 如果是 final，只有内容相似（或同一个语言轨道）才收口
							// 对于翻译，因为 ASR 可能不断微调原文，这里放宽一点限制
							const updated = [...prev]
							updated[lastMatchIndex] = {
								...activeUnfinished,
								text: incomingText,
								isFinal: data.isFinal,
								timestamp: now,
							}

							// 始终确保最新的更新排在最后（针对当前语言轨道）
							if (lastMatchIndex !== updated.length - 1) {
								const [item] = updated.splice(lastMatchIndex, 1)
								updated.push(item)
							}

							return updated.length > 3 ? updated.slice(-3) : updated
						}

						// 处理 Final 的重复/迟到包逻辑
						if (data.isFinal) {
							const lastFinal = [...prev].reverse().find((c) => c.isFinal)
							if (
								lastFinal &&
								isSimilarCaptionText(lastFinal.text, incomingText)
							) {
								return prev
							}
						}

						// 没有找到匹配的未完成字幕，或者是一段全新的内容：添加新行
						const newCaption = {
							id: `${id}-${now}-${Math.random()}`,
							text: incomingText,
							isFinal: data.isFinal,
							timestamp: now,
						}

						const updated = [...prev, newCaption]
						// 增加显示行数到 3 行，以防翻译和原文重叠
						return updated.length > 3 ? updated.slice(-3) : updated
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
						'relative max-w-[--participant-max-width] rounded-xl bg-zinc-800/50 ring-1 ring-white/10',
						isScreenshareClickable && 'cursor-pointer active:scale-[0.995]'
					)}
					onClick={
						isScreenshareClickable
							? () => onParticipantClick?.(user)
							: undefined
					}
					onKeyDown={
						isScreenshareClickable
							? (event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault()
										onParticipantClick?.(user)
									}
								}
							: undefined
					}
					role={isScreenshareClickable ? 'button' : undefined}
					tabIndex={isScreenshareClickable ? 0 : undefined}
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
											alt={displayName}
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
						// 屏幕共享使用低延迟模式
						lowLatency={isScreenShare}
						onDoubleClick={() => {
							// Double-click to toggle camera facing on mobile (only for self view)
							if (isSelf && !isScreenShare) {
								userMedia.toggleCameraFacing()
							}
						}}
					/>
					{/* Only show spinner when user has video enabled but track hasn't arrived yet */}
					{shouldPullVideo &&
						user.tracks.videoEnabled &&
						user.tracks.video &&
						!pulledVideoTrack && (
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
							{audioTrack && user.tracks.audioEnabled && isSpeaking && (
								<AudioIndicator audioTrack={audioTrack} />
							)}

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
					{displayName && (
						<div className="flex items-center gap-2 absolute m-3 left-0 bottom-0 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg text-sm font-medium">
							<ConnectionIndicator quality={getConnectionQuality(packetLoss)} />
							{!isScreenShare && e2eeStatus.enabled && (
								<Tooltip
									content={
										<div className="space-y-1">
											<div>
												{e2eeStatus.strictReady
													? 'E2EE is enabled and verified'
													: 'E2EE is enabled, waiting for verification'}
											</div>
											<div className="font-mono text-xs select-all break-all">
												Safety Number: {e2eeSafetyNumber ?? 'pending'}
											</div>
											{e2eeStatus.peerExchangeRequired &&
												!e2eeStatus.peerExchangeCompleted && (
													<div className="text-xs">
														Waiting for peer key exchange...
													</div>
												)}
										</div>
									}
								>
									<div className="relative flex items-center justify-center">
										{showInlineSafetyNumber && e2eeSafetyNumber && (
											<div className="absolute bottom-full mb-2 px-2 py-1 bg-zinc-900/90 backdrop-blur-md border border-emerald-500/30 rounded-md shadow-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
												<span className="font-mono text-[10px] text-emerald-400 whitespace-nowrap">
													{e2eeSafetyNumber.slice(0, 8)}
												</span>
												{/* Triangle pointer */}
												<div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900/90" />
											</div>
										)}
										<button
											onClick={(e) => {
												e.stopPropagation()
												setShowInlineSafetyNumber(!showInlineSafetyNumber)
											}}
											className="flex items-center"
										>
											<Icon
												type="LockClosedIcon"
												className={cn(
													'w-4 h-4 cursor-pointer',
													e2eeStatus.strictReady
														? 'text-emerald-400'
														: 'text-yellow-300'
												)}
											/>
										</button>
									</div>
								</Tooltip>
							)}
							<OptionalLink
								className="leading-none text-white/90"
								href={traceHref}
								target="_blank"
								rel="noopener noreferrer"
							>
								{displayName}
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
