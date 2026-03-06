import * as ToastPrimitive from '@radix-ui/react-toast'
import {
	createContext,
	useCallback,
	useContext,
	useState,
	type ReactNode,
} from 'react'
import { nanoid } from 'nanoid'
import { AnimatePresence, motion } from 'framer-motion'

interface Notification {
	content: ReactNode
	id: string
	duration?: number
}

const NotificationToasts = createContext([
	[] as Notification[],
	(_content: ReactNode, _options?: { duration?: number; id?: string }) => {},
] as const)

export const Root = (props: ToastPrimitive.ToastProps) => (
	<ToastPrimitive.Root asChild {...props}>
		<motion.li
			layout
			initial={{ opacity: 0, x: 20, scale: 0.9 }}
			animate={{ opacity: 1, x: 0, scale: 1 }}
			exit={{ opacity: 0, x: 20, scale: 0.9 }}
			transition={{ type: 'spring', damping: 25, stiffness: 200 }}
			className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 text-zinc-100 pointer-events-auto overflow-hidden relative group"
		>
			{props.children}
		</motion.li>
	</ToastPrimitive.Root>
)

export const NotificationToastsProvider = (props: { children?: ReactNode }) => {
	const [messages, setMessages] = useState<Notification[]>([])

	const dispatch = useCallback(
		(content: ReactNode, options?: { duration?: number; id?: string }) => {
			const id = options?.id ?? (typeof content === 'string' ? content : nanoid(14))
			setMessages((ms) => {
				if (ms.some((m) => m.id === id)) return ms
				return [
					...ms,
					{
						...options,
						id,
						content,
					},
				]
			})
		},
		[]
	)

	const value = [messages, dispatch] as const

	return (
		<ToastPrimitive.Provider duration={4000}>
			<NotificationToasts.Provider value={value}>
				{props.children}
				<ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex flex-col p-6 gap-3 w-full max-w-md m-0 list-none outline-none pointer-events-none" />
				<AnimatePresence mode="popLayout">
					{messages.map(({ content, id, duration }) => (
						<Root
							forceMount
							key={id}
							duration={duration}
							onOpenChange={(open) => {
								if (!open) {
									setMessages((ms) => ms.filter((m) => m.id !== id))
								}
							}}
						>
							{content}
						</Root>
					))}
				</AnimatePresence>
			</NotificationToasts.Provider>
		</ToastPrimitive.Provider>
	)
}

export const useDispatchToast = () => useContext(NotificationToasts)[1]

export default {
	...ToastPrimitive,
	Provider: NotificationToastsProvider,
	Viewport: ToastPrimitive.Viewport,
}
