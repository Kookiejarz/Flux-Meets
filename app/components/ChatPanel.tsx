import { AnimatePresence, motion } from 'framer-motion'
import Linkify from 'linkify-react'
import { useEffect, useRef, useState } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import { cn } from '~/utils/style'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Input } from './Input'

export function ChatPanel({ onClose }: { onClose: () => void }) {
	const {
		room: { websocket, identity },
		chatMessages,
		setChatMessages,
	} = useRoomContext()
	const [inputText, setInputText] = useState('')
	const messagesEndRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [chatMessages])

	const sendMessage = (e: React.FormEvent) => {
		e.preventDefault()
		if (!inputText.trim()) return

		websocket.send(
			JSON.stringify({
				type: 'roomMessage',
				message: inputText.trim(),
			})
		)

		setChatMessages((prev) => [
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
		<div className="flex flex-col h-full bg-zinc-900 border-l border-white/10 w-full text-zinc-100 relative">
			<div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
				<div className="flex items-center gap-2">
					<Icon
						type="chatBubbleLeftRight"
						className="w-5 h-5 text-orange-500"
					/>
					<h2 className="text-lg font-semibold">In-call Messages</h2>
				</div>
				<Button
					displayType="ghost"
					onClick={onClose}
					className="p-2 w-10 h-10 rounded-full hover:bg-white/10 transition-colors"
				>
					<Icon type="xMark" className="w-6 h-6" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{chatMessages.length === 0 && (
					<div className="text-center text-zinc-500 mt-10 text-sm">
						No messages yet. Say hello!
					</div>
				)}
				<AnimatePresence initial={false}>
					{chatMessages.map((msg) => (
						<motion.div
							key={msg.id}
							initial={{ opacity: 0, y: 10, scale: 0.95 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							transition={{ duration: 0.2, ease: 'easeOut' }}
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
								<Linkify
									options={{
										className:
											'underline underline-offset-2 hover:text-orange-200 transition-colors',
										target: '_blank',
									}}
								>
									{msg.text}
								</Linkify>
							</div>
						</motion.div>
					))}
				</AnimatePresence>
				<div ref={messagesEndRef} />
			</div>

			<div className="p-4 border-t border-white/10">
				<form onSubmit={sendMessage} className="flex gap-2 items-center">
					<Input
						value={inputText}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							setInputText(e.target.value)
						}
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
