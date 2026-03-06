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
		maxWebcamBitrate,
		maxWebcamFramerate,
		maxWebcamQualityLevel,
		moqEnabled,
		setMoqEnabled,
		aiEnabled,
		aiTranslationEnabled,
		setAiTranslationEnabled,
		asrSource,
		setAsrSource,
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
							Noise
						</Label>
						<Toggle
							id="suppressNoise"
							checked={suppressNoise}
							onCheckedChange={setSuppressNoise}
						/>

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
									].map((source) => (
										<button
											key={source.val}
											onClick={() =>
												setAsrSource(source.val as 'browser' | 'workers-ai')
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

								<div className="md:col-span-2 border-t border-white/5 my-2"></div>
							</>
						)}

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
