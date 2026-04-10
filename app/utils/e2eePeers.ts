import type { User } from '~/types/Messages'

export function hasOtherConnectedUsers(users: User[], selfId?: string) {
	if (!selfId) return users.length > 0
	return users.some((user) => user.id !== selfId)
}

export function shouldCreateE2EEGroup(users: User[], selfId?: string) {
	return !hasOtherConnectedUsers(users, selfId)
}
