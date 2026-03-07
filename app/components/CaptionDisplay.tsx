import {
	DndContext,
	PointerSensor,
	useDraggable,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import { useEffect, useRef, useState } from 'react'
import { cn } from '~/utils/style'

interface CaptionEntry {
	id: string
	text: string
	isFinal: boolean
	timestamp: number
}

interface CaptionDisplayProps {
	captions: CaptionEntry[]
	userId?: string
	fadeStartMs?: number
}

function DraggableCaption({
	id,
	captions,
	position,
	transformRef,
	fadeStartMs,
}: {
	id: string
	captions: CaptionEntry[]
	position: { x: number; y: number }
	transformRef: React.MutableRefObject<{ x: number; y: number } | null>
	fadeStartMs: number
}) {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id,
		})

	transformRef.current = transform

	if (captions.length === 0) return null

	// Combine the saved position with the active drag transform
	const x = position.x + (transform?.x ?? 0)
	const y = position.y + (transform?.y ?? 0)

	return (
		<div
			ref={setNodeRef}
			className={cn(
				'absolute bottom-10 left-0 right-0 z-[50] w-full flex justify-start',
				isDragging ? 'cursor-grabbing' : 'cursor-grab',
				'touch-none select-none',
				'py-2 pl-4'
			)}
			style={{
				transform: `translate3d(${x}px, ${y}px, 0)`,
			}}
			{...listeners}
			{...attributes}
		>
			<div
				className={cn(
					'space-y-2 max-w-[90%] min-h-[6rem] flex flex-col justify-end items-start pointer-events-none',
					isDragging && 'ring-2 ring-white/60 scale-105'
				)}
			>
				{captions.map((caption, idx) => {
					const isLatest = idx === captions.length - 1
					const age = Date.now() - caption.timestamp
					const fadeOut = age > fadeStartMs

					return (
						<div
							key={caption.id}
							className={cn(
								'bg-black/70 text-white px-4 py-2 rounded-lg text-sm md:text-base break-words text-left w-fit max-w-full shadow-xl backdrop-blur-md transition-all duration-500 animate-slide-in-up',
								// 未完成的字幕闪烁加左边框
								!isLatest && 'opacity-60 text-xs',
								isLatest &&
									!caption.isFinal &&
									'border-l-2 border-orange-400/60 pl-3 animate-pulse',
								// 字幕先淡出再移除，避免直接消失
								fadeOut && 'opacity-0',
								// 拖拽时的效果
								isDragging && 'bg-black/85 shadow-orange-500/30'
							)}
						>
							{caption.text}
						</div>
					)
				})}
			</div>
		</div>
	)
}

export function CaptionDisplay({
	captions,
	userId = 'local',
	fadeStartMs = 2800,
}: CaptionDisplayProps) {
	const [position, setPosition] = useState({ x: 0, y: 0 })
	const [isClient, setIsClient] = useState(false)
	const transformRef = useRef<{ x: number; y: number } | null>(null)

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

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		})
	)

	if (!isClient) return null

	return (
		<DndContext
			sensors={sensors}
			modifiers={[restrictToWindowEdges]}
			onDragEnd={() => {
				const tx = transformRef.current
				if (tx) {
					const newPosition = {
						x: position.x + tx.x,
						y: position.y + tx.y,
					}
					setPosition(newPosition)
					transformRef.current = null
					try {
						localStorage.setItem(
							`caption-position-${userId}`,
							JSON.stringify(newPosition)
						)
					} catch (e) {
						// ignore
					}
				}
			}}
		>
			<DraggableCaption
				id={`caption-draggable-${userId}`}
				captions={captions}
				position={position}
				transformRef={transformRef}
				fadeStartMs={fadeStartMs}
			/>
		</DndContext>
	)
}
