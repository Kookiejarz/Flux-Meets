import { createGrid } from 'good-grid'
import { useGridDimensions } from 'good-grid/react'
import React, { useRef } from 'react'
import { Flipper } from 'react-flip-toolkit'
import type { User } from '~/types/Messages'
import { Participant } from './Participant'

export function ParticipantLayout({
	users,
	gap,
	aspectRatio,
	onParticipantClick,
}: {
	users: User[]
	gap: number
	aspectRatio: string
	onParticipantClick?: (user: User) => void
}) {
	const $el = useRef<HTMLDivElement>(null)

	// hook that listens to resize of the element
	// and returns it's dimensions
	const dimensions = useGridDimensions($el as React.RefObject<HTMLDivElement>)

	const { width, height, getPosition } = createGrid({
		dimensions,
		count: users.length,
		aspectRatio,
		gap,
	})

	if (users.length === 0) {
		return null
	}

	const flipKey = users.map((u) => u.id).join(',')

	return (
		<Flipper flipKey={flipKey}>
			<div
				className="absolute inset-[--gap] h-[--height] w-[--width] isolate flex flex-wrap justify-around"
				ref={$el}
				style={
					{
						'--gap': '-' + gap + 'px',
						height: `calc(100% + ${gap}px + ${gap}px`,
						width: `calc(100% + ${gap}px + ${gap}px`,
					} as any
				}
			>
				{users.map((user, i) => {
					const { top, left } = getPosition(i)
					return (
						<Participant
							style={{
								width,
								height,
								top,
								left,
								position: 'absolute',
								transition: '0.4s all',
							}}
							key={user.id}
							user={user}
							onParticipantClick={onParticipantClick}
						/>
					)
				})}
			</div>
		</Flipper>
	)
}
