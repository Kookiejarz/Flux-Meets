import React, { useEffect, useState } from 'react'
import { cn } from '~/utils/style'

interface CaptionDisplayProps {
	text: string
	isFinal: boolean
}

export function CaptionDisplay({ text, isFinal }: CaptionDisplayProps) {
	const [visibleText, setVisibleText] = useState('')

	useEffect(() => {
		setVisibleText(text)

		if (isFinal) {
			const timeout = setTimeout(() => {
				setVisibleText('')
			}, 5000) // Clear final caption after 5 seconds
			return () => clearTimeout(timeout)
		}
	}, [text, isFinal])

	if (!visibleText) return null

	return (
		<div
			className={cn(
				'absolute bottom-10 left-0 right-0 flex justify-center px-4 pointer-events-none z-10'
			)}
		>
			<div
				className={cn(
					'bg-black/60 text-white px-3 py-1 rounded-lg text-sm md:text-base max-w-full break-words text-center shadow-lg backdrop-blur-sm transition-all duration-300',
					!isFinal && 'border-b-2 border-orange-400/50'
				)}
			>
				{visibleText}
			</div>
		</div>
	)
}
