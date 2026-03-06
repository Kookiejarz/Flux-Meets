import type { FC } from 'react'
import { cn } from '~/utils/style'

interface DisclaimerProps {
	className?: string
}

export const Disclaimer: FC<DisclaimerProps> = ({ className }) => {
	return (
		<p
			className={cn(
				'max-w-prose text-xs leading-relaxed text-zinc-400 dark:text-zinc-500',
				className
			)}
		>
			🎬 Flux Meet is an application built using{' '}
			<a className="underline" href="https://developers.cloudflare.com/calls/">
				Cloudflare Calls
			</a>
			<br />
			<span className="block text-center">
				<a className="underline" href="https://liuu.org/">
					Powered by Kenneth Liu and Cloudflare Infrastructure
				</a>
			</span>
		</p>
	)
}
