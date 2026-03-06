import {
	DndContext,
	PointerSensor,
	useDraggable,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import { useEffect, useState } from 'react'
import { cn } from '~/utils/style'

interface CaptionDisplayProps {
	text: string
	isFinal: boolean
	userId?: string
}

function DraggableCaption({
	id,
	text,
	isFinal,
	position,
}: {
	id: string
	text: string
	isFinal: boolean
	position: { x: number; y: number }
}) {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id,
		})

	// Combine the saved position with the active drag transform
	const x = position.x + (transform?.x ?? 0)
	const y = position.y + (transform?.y ?? 0)

	return (
		<div
			ref={setNodeRef}
			className={cn(
				'absolute bottom-10 left-0 right-0 z-[50] w-full flex justify-center',
				isDragging ? 'cursor-grabbing' : 'cursor-grab',
				// Enable pointer events, prevent touch scrolling on mobile
				'pointer-events-auto touch-none'
			)}
			style={{
				transform: `translate3d(${x}px, ${y}px, 0)`,
			}}
			{...listeners}
			{...attributes}
		>
			<div
				className={cn(
					'bg-black/60 text-white px-4 py-2 rounded-lg text-sm md:text-base max-w-[90%] break-words text-center shadow-lg backdrop-blur-sm transition-colors duration-300',
					!isFinal && 'border-b-2 border-orange-400/50',
					isDragging && 'ring-2 ring-white/50 bg-black/80'
				)}
			>
				{text}
			</div>
		</div>
	)
}

export function CaptionDisplay({
	text,
	isFinal,
	userId = 'local',
}: CaptionDisplayProps) {
	const [visibleText, setVisibleText] = useState('')
	const [position, setPosition] = useState({ x: 0, y: 0 })
	const [isClient, setIsClient] = useState(false)

	useEffect(() => {
		setIsClient(true)
		try {
			const saved = localStorage.getItem(`caption-position-${userId}`)
			if (saved) {
				const parsed = JSON.parse(saved)
				if (
					typeof parsed.x === 'number' &&
					!isNaN(parsed.x) &&
					typeof parsed.y === 'number' &&
					!isNaN(parsed.y)
				) {
					setPosition(parsed)
				}
			}
		} catch (e) {
			// ignore
		}
	}, [userId])

	useEffect(() => {
		setVisibleText(text)

		if (isFinal) {
			const timeout = setTimeout(() => {
				setVisibleText('')
			}, 5000)
			return () => clearTimeout(timeout)
		}
	}, [text, isFinal])

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 5,
			},
		})
	)

	if (!visibleText) return null
	if (!isClient) return null

	return (
		<DndContext
			sensors={sensors}
			modifiers={[restrictToWindowEdges]}
			onDragEnd={(event) => {
				const { delta } = event
				const newPosition = {
					x: position.x + delta.x,
					y: position.y + delta.y,
				}
				setPosition(newPosition)
				try {
					localStorage.setItem(
						`caption-position-${userId}`,
						JSON.stringify(newPosition)
					)
				} catch (e) {
					// ignore
				}
			}}
		>
			<DraggableCaption
				id={`caption-draggable-${userId}`}
				text={visibleText}
				isFinal={isFinal}
				position={position}
			/>
		</DndContext>
	)
}
