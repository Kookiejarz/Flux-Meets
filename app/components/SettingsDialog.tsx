import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { FC, ReactNode } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import { cn } from '~/utils/style'
import { AudioInputSelector } from './AudioInputSelector'
import { Button } from './Button'
import {
	Description,
	Dialog,
	DialogContent,
	DialogOverlay,
	DialogTitle,
	Portal,
	Trigger,
} from './Dialog'
import { Icon } from './Icon/Icon'
import { Label } from './Label'
import { Toggle } from './Toggle'
import { Tooltip } from './Tooltip'
import { VideoInputSelector } from './VideoInputSelector'

interface SettingsDialogProps {
	onOpenChange?: (open: boolean) => void
	open?: boolean
	children?: ReactNode
}

function formatBitrate(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return '--'
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mbps`
	return `${Math.round(value / 1000)} kbps`
}

function formatPercent(value: number): string {
	if (!Number.isFinite(value) || value < 0) return '--'
	return `${(value * 100).toFixed(1)}%`
}

export const SettingsButton = () => {
	return (
		<SettingsDialog>
			<Tooltip content="Settings">
				<Trigger asChild>
					<Button className="text-sm" displayType="secondary">
						<Icon type="cog" />
					</Button>
				</Trigger>
			</Tooltip>
		</SettingsDialog>
	)
}

export const SettingsDialog: FC<SettingsDialogProps> = ({
	onOpenChange,
	open,
	children,
}) => {
	const {
		userMedia: { blurVideo, setBlurVideo, suppressNoise, setSuppressNoise },
		webcamBitrate,
		setWebcamBitrate,
		webcamFramerate,
		setWebcamFramerate,
		webcamQuality,
		setWebcamQuality,
		videoDenoise,
		setVideoDenoise,
		maxWebcamBitrate,
		maxWebcamFramerate,
		maxWebcamQualityLevel,
		moqEnabled,
		setMoqEnabled,
		highFpsScreenshare,
		setHighFpsScreenshare,
		aiEnabled,
		aiTranslationEnabled,
		setAiTranslationEnabled,
		asrSource,
		setAsrSource,
		localCcLanguage,
		setLocalCcLanguage,
		displayCaptionLanguage,
		setDisplayCaptionLanguage,
		micVolume,
		setMicVolume,
		speakerVolume,
		setSpeakerVolume,
		adaptiveNetwork,
	} = useRoomContext()

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{children}
			<Portal>
				<DialogOverlay />
				<DialogContent className="max-w-2xl">
					<DialogTitle>Settings</DialogTitle>
					<VisuallyHidden>
						<Description>
							Adjust your camera, microphone, and other meeting settings.
						</Description>
					</VisuallyHidden>
					<div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-x-6 gap-y-6 mt-8 items-center">
						<Label className="md:text-right" htmlFor="camera">
							Camera
						</Label>
						<VideoInputSelector id="camera" />

						<Label className="md:text-right" htmlFor="mic">
							Mic
						</Label>
						<AudioInputSelector id="mic" />

						<Label className="md:text-right" htmlFor="micVolume">
							Mic Volume
						</Label>
						<div className="flex items-center gap-3">
							<input
								type="range"
								id="micVolume"
								min="0"
								max="200"
								value={micVolume}
								onChange={(e) => setMicVolume(Number(e.target.value))}
								className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
							/>
							<span className="text-sm font-mono text-zinc-400 w-12 text-right">
								{micVolume}%
							</span>
						</div>
						<p className="md:col-start-2 text-xs text-zinc-500 -mt-2">
							Adjust microphone input gain (100% = normal, 200% = boost for
							quiet mics)
						</p>

						<Label className="md:text-right" htmlFor="speakerVolume">
							Speaker Volume
						</Label>
						<div className="flex items-center gap-3">
							<input
								type="range"
								id="speakerVolume"
								min="0"
								max="150"
								value={speakerVolume}
								onChange={(e) => setSpeakerVolume(Number(e.target.value))}
								className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
							/>
							<span className="text-sm font-mono text-zinc-400 w-12 text-right">
								{speakerVolume}%
							</span>
						</div>
						<p className="md:col-start-2 text-xs text-zinc-500 -mt-2">
							Adjust speaker output volume (100% = normal)
						</p>

						<div className="md:col-span-2 border-t border-white/5 my-2"></div>

						<Label className="md:text-right" htmlFor="bitrate">
							Bitrate
						</Label>
						<div className="flex flex-wrap gap-2">
							{[
								{
									label: 'Low',
									val: Math.max(100000, Math.floor(maxWebcamBitrate * 0.3)),
								},
								{
									label: 'Mid',
									val: Math.max(500000, Math.floor(maxWebcamBitrate * 0.6)),
								},
								{ label: 'Max', val: maxWebcamBitrate },
							].map((tier) => (
								<button
									key={tier.label}
									onClick={() => setWebcamBitrate(tier.val)}
									className={cn(
										'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
										webcamBitrate === tier.val
											? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
											: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-200'
									)}
								>
									{tier.label} ({(tier.val / 1000000).toFixed(1)}M)
								</button>
							))}
						</div>

						<Label className="md:text-right" htmlFor="framerate">
							Framerate
						</Label>
						<div className="flex flex-wrap gap-2">
							{[15, 24, 30, 60, 90, 120, 144]
								.filter((fps) => fps <= maxWebcamFramerate || fps === 30) // Always show at least 30 if possible
								.concat(maxWebcamFramerate)
								.filter((v, i, a) => a.indexOf(v) === i) // Unique
								.sort((a, b) => a - b)
								.map((fps) => (
									<button
										key={fps}
										onClick={() => setWebcamFramerate(fps)}
										className={cn(
											'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
											webcamFramerate === fps
												? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
												: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-200'
										)}
									>
										{fps} FPS
									</button>
								))}
						</div>

						<Label className="md:text-right" htmlFor="quality">
							Resolution
						</Label>
						<div className="flex flex-wrap gap-2">
							{[360, 480, 720, 1080, 1440, 2160]
								.filter((p) => p <= maxWebcamQualityLevel)
								.concat(maxWebcamQualityLevel)
								.filter((v, i, a) => a.indexOf(v) === i)
								.sort((a, b) => a - b)
								.map((p) => (
									<button
										key={p}
										onClick={() => setWebcamQuality(p)}
										className={cn(
											'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
											webcamQuality === p
												? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
												: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-200'
										)}
									>
										{p}P
									</button>
								))}
						</div>

						<Label className="md:text-right" htmlFor="videoDenoise">
							Video Denoise
						</Label>
						<div className="flex flex-col gap-1">
							<Toggle
								id="videoDenoise"
								checked={videoDenoise}
								onCheckedChange={setVideoDenoise}
							/>
							<span className="text-xs text-zinc-500">
								Raises video bitrate and reduces downscaling to keep low-light
								details. Uses more bandwidth.
							</span>
						</div>
						<Label className="md:text-right" htmlFor="adaptiveNetwork">
							Adaptive
						</Label>
						<div
							id="adaptiveNetwork"
							className="rounded-lg border border-zinc-200/70 dark:border-zinc-700/70 p-3 bg-zinc-50/60 dark:bg-zinc-900/30"
						>
							<div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
								Network Adaptation Runtime
							</div>
							<div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
								<div>
									Video tier: {adaptiveNetwork.videoTier + 1}/
									{adaptiveNetwork.videoTierCount}
								</div>
								<div>
									Audio tier: {adaptiveNetwork.audioTier + 1}/
									{adaptiveNetwork.audioTierCount}
								</div>
								<div>
									Video target:{' '}
									{formatBitrate(adaptiveNetwork.videoTargetBitrate)}
								</div>
								<div>
									Video measured:{' '}
									{formatBitrate(adaptiveNetwork.videoMeasuredBitrate)}
								</div>
								<div>
									Uplink: {formatBitrate(adaptiveNetwork.uplinkBitrate)}
								</div>
								<div>
									Downlink: {formatBitrate(adaptiveNetwork.downlinkBitrate)}
								</div>
								<div>
									Video RTT: {Math.round(adaptiveNetwork.videoRttMs)} ms
								</div>
								<div>
									Audio RTT: {Math.round(adaptiveNetwork.audioRttMs)} ms
								</div>
								<div>
									Video loss: {formatPercent(adaptiveNetwork.videoLossRate)}
								</div>
								<div>
									Audio loss: {formatPercent(adaptiveNetwork.audioLossRate)}
								</div>
							</div>
							<div className="mt-2 text-[11px] text-zinc-500">
								Updated:{' '}
								{adaptiveNetwork.lastUpdatedAt
									? new Date(adaptiveNetwork.lastUpdatedAt).toLocaleTimeString()
									: '--'}
							</div>
						</div>

						<div className="md:col-span-2 border-t border-white/5 my-2"></div>

						<Label className="md:text-right" htmlFor="blurBackground">
							Blur
						</Label>
						<Toggle
							id="blurBackground"
							checked={blurVideo}
							onCheckedChange={setBlurVideo}
						/>

						<Label className="md:text-right" htmlFor="suppressNoise">
							Background Noise Suppression
						</Label>
						<Toggle
							id="suppressNoise"
							checked={suppressNoise}
							onCheckedChange={setSuppressNoise}
						/>
						<p className="md:col-span-2 text-xs text-zinc-500 -mt-2">
							Use RNNoise AI to remove background noise. May add slight latency.
							Best for noisy environments or speaker mode.
						</p>
						<Label className="md:text-right" htmlFor="localCcLanguage">
							Local CC Language
						</Label>
						<div className="flex flex-wrap gap-2" id="localCcLanguage">
							{[
								{ label: 'Browser', val: 'browser' },
								{ label: '中文', val: 'zh-CN' },
								{ label: 'English', val: 'en-US' },
							].map((option) => (
								<button
									key={option.val}
									onClick={() =>
										setLocalCcLanguage(
											option.val as 'browser' | 'zh-CN' | 'en-US'
										)
									}
									className={cn(
										'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
										localCcLanguage === option.val
											? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
											: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-200'
									)}
								>
									{option.label}
								</button>
							))}
						</div>
						<p className="md:col-start-2 text-xs text-zinc-500 -mt-2">
							Browser uses the detected browser language.
						</p>

						<Label className="md:text-right" htmlFor="displayCaptionLanguage">
							Display Caption Language
						</Label>
						<div className="flex flex-wrap gap-2" id="displayCaptionLanguage">
							{[
								{ label: 'Auto', val: 'auto' },
								{ label: 'All', val: 'all' },
								{ label: 'Original Only', val: 'original' },
								{ label: 'English Only', val: 'en' },
								{ label: '中文 Only', val: 'zh' },
							].map((option) => (
								<button
									key={option.val}
									onClick={() =>
										setDisplayCaptionLanguage(
											option.val as 'all' | 'en' | 'zh' | 'original' | 'auto'
										)
									}
									className={cn(
										'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
										displayCaptionLanguage === option.val
											? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
											: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-200'
									)}
								>
									{option.label}
								</button>
							))}
						</div>
						<p className="md:col-start-2 text-xs text-zinc-500 -mt-2">
							Filter which translated captions to display.
						</p>

						<div className="md:col-span-2 border-t border-white/5 my-2"></div>

						{aiEnabled && (
							<>
								<Label className="md:text-right" htmlFor="asrSource">
									ASR Source
								</Label>
								<div className="flex flex-wrap gap-2">
									{[
										{ label: 'Browser', val: 'browser' },
										{ label: 'Workers AI', val: 'workers-ai' },
										{ label: 'Assembly AI', val: 'assembly-ai' },
									].map((source) => (
										<button
											key={source.val}
											onClick={() =>
												setAsrSource(
													source.val as 'browser' | 'workers-ai' | 'assembly-ai'
												)
											}
											className={cn(
												'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
												asrSource === source.val
													? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
													: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-orange-200'
											)}
										>
											{source.label}
										</button>
									))}
								</div>
								<p className="md:col-start-2 text-xs text-zinc-500 -mt-2">
									Browser ASR may not be available on mobile devices. Workers AI
									or Assembly AI is recommended for mobile.
								</p>

								<Label className="md:text-right" htmlFor="aiTranslation">
									AI Translation
								</Label>
								<div className="flex items-center gap-4">
									<Toggle
										id="aiTranslation"
										checked={aiTranslationEnabled}
										onCheckedChange={setAiTranslationEnabled}
									/>
									{aiTranslationEnabled && (
										<span className="text-xs text-zinc-500">
											Multi-language CC Enabled
										</span>
									)}
								</div>
							</>
						)}
						<Label className="md:text-right" htmlFor="highFpsScreenshare">
							<div className="flex flex-col md:items-end">
								<span>High FPS Screenshare</span>
								<span className="text-[10px] text-zinc-500 font-medium">
									30fps (higher latency)
								</span>
							</div>
						</Label>
						<div className="flex items-center gap-4">
							<Toggle
								id="highFpsScreenshare"
								checked={highFpsScreenshare}
								onCheckedChange={setHighFpsScreenshare}
							/>
							{highFpsScreenshare ? (
								<span className="text-xs text-orange-500">
									30fps - Smooth but ~2s delay
								</span>
							) : (
								<span className="text-xs text-green-500">
									15fps - Low latency
								</span>
							)}
						</div>
						<Label className="md:text-right" htmlFor="moq">
							<div className="flex flex-col md:items-end">
								<span>Media over QUIC</span>
								<span className="text-[10px] text-orange-500 font-black uppercase tracking-wider">
									Experimental
								</span>
							</div>
						</Label>
						<div className="flex items-center gap-4">
							<Toggle
								id="moq"
								checked={moqEnabled}
								onCheckedChange={setMoqEnabled}
							/>
							{moqEnabled && (
								<span className="text-xs text-zinc-500 animate-pulse">
									Draft-14 Relay Active
								</span>
							)}
						</div>
					</div>
				</DialogContent>
			</Portal>
		</Dialog>
	)
}
