import { describe, expect, test } from 'vitest'
import type { User } from '~/types/Messages'
import {
	hasOtherConnectedUsers,
	shouldCreateE2EEGroup,
} from './e2eePeers'

function makeUser(id: string, joined = false): User {
	return {
		id,
		name: id,
		joined,
		raisedHand: false,
		speaking: false,
		tracks: {
			audioUnavailable: false,
			audioEnabled: false,
			videoEnabled: false,
			screenShareEnabled: false,
		},
	}
}

describe('e2ee peer detection', () => {
	test('treats another connected lobby user as a peer', () => {
		const users = [makeUser('self'), makeUser('peer')]
		expect(hasOtherConnectedUsers(users, 'self')).toBe(true)
		expect(shouldCreateE2EEGroup(users, 'self')).toBe(false)
	})

	test('allows group creation only when no other session is connected', () => {
		const users = [makeUser('self')]
		expect(hasOtherConnectedUsers(users, 'self')).toBe(false)
		expect(shouldCreateE2EEGroup(users, 'self')).toBe(true)
	})

	test('does not depend on joined state', () => {
		const users = [makeUser('self', true), makeUser('peer', false)]
		expect(hasOtherConnectedUsers(users, 'self')).toBe(true)
		expect(shouldCreateE2EEGroup(users, 'self')).toBe(false)
	})
})
