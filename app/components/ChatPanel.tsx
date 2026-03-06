import { useEffect, useRef, useState } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import { cn } from '~/utils/style'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Input } from './Input'

export function ChatPanel({ onClose }: { onClose: () => void }) {
	const {
		room: { websocket, identity },
	} = useRoomContext()
	const [messages, setMessages] = useState<
		{ id: string; sender: string; text: string; time: Date; isSelf: boolean }[]
	>([])
	const [inputText, setInputText] = useState('')
	const messagesEndRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const handleMessage = (e: MessageEvent) => {
			const data = JSON.parse(e.data)
			if (data.type === 'roomMessage') {
				setMessages((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						sender: data.from,
						text: data.message,
						time: new Date(),
						isSelf: false,
					},
				])
			}
		}

		websocket.addEventListener('message', handleMessage)
		return () => websocket.removeEventListener('message', handleMessage)
	}, [websocket])

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages])

	const sendMessage = (e: React.FormEvent) => {
		e.preventDefault()
		if (!inputText.trim()) return

		websocket.send(
			JSON.stringify({
				type: 'roomMessage',
				message: inputText.trim(),
			})
		)

		setMessages((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				sender: identity?.name || 'Me',
				text: inputText.trim(),
				time: new Date(),
				isSelf: true,
			},
		])
		setInputText('')
	}

	return (
		<div className="flex flex-col h-full bg-zinc-900 border-l border-white/10 w-full sm:w-80 text-zinc-100 relative">
			<div className="flex items-center justify-between p-4 border-b border-white/10">
				<h2 className="text-lg font-semibold">In-call Messages</h2>
				<Button
					displayType="ghost"
					onClick={onClose}
					className="p-2 w-auto h-auto rounded-md"
				>
					<Icon type="xMark" className="w-5 h-5" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{messages.length === 0 && (
					<div className="text-center text-zinc-500 mt-10 text-sm">
						No messages yet. Say hello!
					</div>
				)}
				{messages.map((msg) => (
					<div
						key={msg.id}
						className={cn(
							'flex flex-col max-w-[85%]',
							msg.isSelf ? 'ml-auto items-end' : 'mr-auto items-start'
						)}
					>
						<div className="flex items-baseline gap-2 mb-1">
							<span className="text-xs font-medium text-zinc-400">
								{msg.isSelf ? 'You' : msg.sender}
							</span>
							<span className="text-[10px] text-zinc-500">
								{msg.time.toLocaleTimeString([], {
									hour: '2-digit',
									minute: '2-digit',
								})}
							</span>
						</div>
						<div
							className={cn(
								'px-3 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap',
								msg.isSelf
									? 'bg-orange-600 text-white rounded-tr-sm'
									: 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
							)}
						>
							{msg.text}
						</div>
					</div>
				))}
				<div ref={messagesEndRef} />
			</div>

			<div className="p-4 border-t border-white/10">
				<form onSubmit={sendMessage} className="flex gap-2 items-center">
					<Input
						value={inputText}
						onChange={(e) => setInputText(e.target.value)}
						placeholder="Send a message..."
						className="flex-1 bg-zinc-800/50 border-white/10 text-white placeholder-zinc-500 rounded-full"
						autoComplete="off"
					/>
					<Button
						type="submit"
						disabled={!inputText.trim()}
						className="p-2 w-10 h-10 rounded-full flex items-center justify-center shrink-0"
					>
						<Icon type="paperAirplane" className="w-5 h-5" />
					</Button>
				</form>
			</div>
		</div>
	)
}
