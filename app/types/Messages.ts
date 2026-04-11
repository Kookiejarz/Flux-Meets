import { type ApiHistoryEntry } from 'partytracks/client'
import type { TrackObject } from '~/utils/callsTypes'

export type User = {
	id: string
	name: string
	transceiverSessionId?: string
	raisedHand: boolean
	speaking: boolean
	joined: boolean
	tracks: {
		audio?: string
		audioEnabled?: boolean
		audioUnavailable: boolean
		video?: string
		videoEnabled?: boolean
		screenshare?: string
		screenShareEnabled?: boolean
	}
}

export type RoomState = {
	meetingId?: string
	roomName?: string
	startTime?: number
	users: User[]
	e2eeGroupEstablished?: boolean
	ai: {
		enabled: boolean
		controllingUser?: string
		error?: string
		connectionPending?: boolean
	}
}

export type ServerMessage =
	| {
			type: 'roomState'
			state: RoomState
	  }
	| {
			type: 'error'
			error?: string
	  }
	| {
			type: 'directMessage'
			from: string
			message: string
	  }
	| {
			type: 'roomMessage'
			from: string
			message: string
	  }
	| {
			type: 'roomMessageEncrypted'
			from: string
			ciphertext: string
			iv: string
	  }
	| {
			type: 'muteMic'
	  }
	| {
			type: 'partyserver-pong'
	  }
	| {
			type: 'e2eeMlsMessage'
			mediaType?: 'audio' | 'video'
			payload: string
	  }
	| {
			type: 'userLeftNotification'
			id: string
	  }
	| {
			type: 'caption'
			userId: string
			text: string
			isFinal: boolean
	  }

export type ClientMessage =
	| {
			type: 'userUpdate'
			user: User
	  }
	| {
			type: 'caption'
			text: string
			isFinal: boolean
			translate?: boolean
	  }
	| {
			type: 'directMessage'
			to: string
			message: string
	  }
	| {
			type: 'roomMessage'
			message: string
	  }
	| {
			type: 'roomMessageEncrypted'
			ciphertext: string
			iv: string
	  }
	| {
			type: 'muteUser'
			id: string
	  }
	| {
			type: 'userLeft'
	  }
	| {
			type: 'partyserver-ping'
	  }
	| {
			type: 'heartbeat'
	  }
	| {
			type: 'enableAi'
			instructions?: string
			voice?: string
	  }
	| {
			type: 'disableAi'
	  }
	| {
			type: 'requestAiControl'
			track: TrackObject
	  }
	| {
			type: 'relenquishAiControl'
	  }
	| {
			type: 'audioChunk'
			data: string // Base64 encoded audio
	  }
	| {
			type: 'callsApiHistoryEntry'
			entry: ApiHistoryEntry
			sessionId?: string
	  }
	| {
			type: 'e2eeMlsMessage'
			mediaType?: 'audio' | 'video'
			payload: string
	  }
	| {
			type: 'setLanguage'
			languages: string[]
	  }
	| {
			type: 'setE2eeGroupEstablished'
	  }
