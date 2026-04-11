import type { User } from '~/types/Messages'

export function hasOtherConnectedUsers(users: User[], selfId?: string) {
	if (!selfId) return users.length > 0
	return users.some((user) => user.id !== selfId)
}

/**
 * Determines whether this user should create the MLS group.
 *
 * When multiple users are present (e.g. simultaneous join), we elect a single
 * leader via deterministic ordering to avoid both users independently creating
 * separate MLS groups (which would cause E2EE key mismatches).
 *
 * Election rule: the user whose connection ID sorts first (lexicographically)
 * among all connected users creates the group; everyone else joins.
 */
export function shouldCreateE2EEGroup(users: User[], selfId?: string) {
	if (!hasOtherConnectedUsers(users, selfId)) return true

	// Deterministic leader election: lowest ID wins
	if (!selfId) return true
	const sortedIds = users.map((u) => u.id).sort()
	return sortedIds[0] === selfId
}
