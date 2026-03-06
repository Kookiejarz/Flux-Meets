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
			🎬 Flux Meet is an application powered by{' '}
			<a className="underline" href="https://liuu.org/">
				Yunheng Liu & Cloudflare Infrastructure
			</a>
			<br />
			<span className="block text-center">
				<a className="underline" href="https://github.com/cloudflare/orange">
					Special thanks to Cloudflare/Orange!
				</a>
			</span>
		</p>
	)
}
