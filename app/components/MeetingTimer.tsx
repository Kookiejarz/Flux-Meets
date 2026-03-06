import { useEffect, useState } from 'react'
import { Tooltip } from './Tooltip'

export function MeetingTimer({ startTime }: { startTime?: number }) {
	const [elapsed, setElapsed] = useState<number>(0)

	useEffect(() => {
		if (!startTime) return

		const update = () => {
			setElapsed(Math.floor((Date.now() - startTime) / 1000))
		}

		update()
		const interval = setInterval(update, 1000)
		return () => clearInterval(interval)
	}, [startTime])

	if (!startTime) return null

	const hours = Math.floor(elapsed / 3600)
	const minutes = Math.floor((elapsed % 3600) / 60)
	const seconds = elapsed % 60

	const parts = [
		hours > 0 ? String(hours).padStart(2, '0') : null,
		String(minutes).padStart(2, '0'),
		String(seconds).padStart(2, '0'),
	].filter(Boolean)

	return (
		<Tooltip content="Meeting Duration">
			<div className="bg-zinc-950/60 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 tabular-nums border border-white/10 shadow-lg pointer-events-auto">
				{parts.join(':')}
			</div>
		</Tooltip>
	)
}

