import * as Toast from '@radix-ui/react-toast'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useEffect, useRef } from 'react'
import { Icon } from '~/components/Icon/Icon'
import { OptionalLink } from '~/components/OptionalLink'
import { useDispatchToast } from '~/components/Toast'
import type { User } from '~/types/Messages'
import populateTraceLink from '~/utils/populateTraceLink'
import { useRoomContext } from './useRoomContext'
import { useUserMetadata } from './useUserMetadata'

function UserJoinedOrLeftToast(props: { user: User; type: 'joined' | 'left' }) {
	const { traceLink } = useRoomContext()
	const { data } = useUserMetadata(props.user.name)

	const isJoined = props.type === 'joined'
	const displayName = data?.displayName || props.user.name

	return (
		<div className="flex items-start gap-4">
			<div
				className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
					isJoined
						? 'bg-emerald-500/20 text-emerald-400'
						: 'bg-rose-500/20 text-rose-400'
				}`}
			>
				<Icon type={isJoined ? 'PlusIcon' : 'phoneXMark'} className="w-5 h-5" />
			</div>

			<div className="flex-1 min-w-0">
				<Toast.Title className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
					<OptionalLink
						className="hover:underline decoration-zinc-500 underline-offset-2 transition-all"
						href={
							props.user.transceiverSessionId
								? populateTraceLink(props.user.transceiverSessionId, traceLink)
								: undefined
						}
						target="_blank"
						rel="noopener noreferrer"
					>
						{displayName}
					</OptionalLink>
				</Toast.Title>
				<Toast.Description className="text-xs text-zinc-400 mt-0.5">
					{isJoined ? 'Just joined the meeting' : 'Has left the meeting'}
				</Toast.Description>
			</div>

			<Toast.Close className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-white/5">
				<Icon type="xMark" className="w-4 h-4" />
				<VisuallyHidden>Dismiss</VisuallyHidden>
			</Toast.Close>
		</div>
	)
}

export function useUserJoinLeaveToasts(users: User[]) {
	const trackedUsersRef = useRef<User[]>(users)
	const dispatchToast = useDispatchToast()

	useEffect(() => {
		const prevUsers = trackedUsersRef.current

		const newUsers = users.filter(
			(u) => !prevUsers.some((tu) => tu.id === u.id)
		)

		const usersLeft = prevUsers.filter(
			(u) => !users.some((tu) => tu.id === u.id)
		)

		newUsers.forEach((u) => {
			if (u.id === 'ai') return // Skip AI for now or handle differently
			dispatchToast(<UserJoinedOrLeftToast user={u} type="joined" />, {
				id: `join-${u.id}`,
			})
		})

		usersLeft.forEach((u) => {
			if (u.id === 'ai') return
			dispatchToast(<UserJoinedOrLeftToast user={u} type="left" />, {
				id: `left-${u.id}`,
			})
		})

		trackedUsersRef.current = users
	}, [dispatchToast, users])
}
