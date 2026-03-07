import { useOutletContext } from '@remix-run/react'
import type { PartyTracks } from 'partytracks/client'
import type { Dispatch, SetStateAction } from 'react'
import type { UserMedia } from '~/hooks/useUserMedia'
import type useRoom from './useRoom'
import type { useRoomHistory } from './useRoomHistory'

export type RoomContextType = {
	traceLink?: string
	feedbackEnabled: boolean
	userDirectoryUrl?: string
	joined: boolean
	setJoined: Dispatch<SetStateAction<boolean>>
	pinnedTileIds: string[]
	setPinnedTileIds: Dispatch<SetStateAction<string[]>>
	showDebugInfo: boolean
	setShowDebugInfo: Dispatch<SetStateAction<boolean>>
	audioOnlyMode: boolean
	setAudioOnlyMode: Dispatch<SetStateAction<boolean>>
	dataSaverMode: boolean
	setDataSaverMode: Dispatch<SetStateAction<boolean>>
	userMedia: UserMedia
	partyTracks: PartyTracks
	iceConnectionState: RTCIceConnectionState
	room: ReturnType<typeof useRoom>
	roomHistory: ReturnType<typeof useRoomHistory>
	simulcastEnabled: boolean
	e2eeSafetyNumber?: string
	e2eeOnJoin: (firstUser: boolean) => void
	webcamBitrate: number
	setWebcamBitrate: Dispatch<SetStateAction<number>>
	webcamFramerate: number
	setWebcamFramerate: Dispatch<SetStateAction<number>>
	webcamQuality: number
	setWebcamQuality: Dispatch<SetStateAction<number>>
	videoDenoise: boolean
	setVideoDenoise: Dispatch<SetStateAction<boolean>>
	maxWebcamBitrate: number
	maxWebcamFramerate: number
	maxWebcamQualityLevel: number
	captionsEnabled: boolean
	setCaptionsEnabled: Dispatch<SetStateAction<boolean>>
	asrSource: 'browser' | 'workers-ai' | 'assembly-ai'
	setAsrSource: Dispatch<SetStateAction<'browser' | 'workers-ai' | 'assembly-ai'>>
	localCcLanguage: 'browser' | 'zh-CN' | 'en-US'
	setLocalCcLanguage: Dispatch<SetStateAction<'browser' | 'zh-CN' | 'en-US'>>
	displayCaptionLanguage: 'all' | 'en' | 'zh' | 'original' | 'auto'
	setDisplayCaptionLanguage: Dispatch<
		SetStateAction<'all' | 'en' | 'zh' | 'original' | 'auto'>
	>
	captionFadeStartMs: number
	captionRemoveMs: number
	captionCleanupIntervalMs: number
	aiEnabled: boolean
	aiTranslationEnabled: boolean
	setAiTranslationEnabled: Dispatch<SetStateAction<boolean>>
	moqEnabled: boolean
	setMoqEnabled: Dispatch<SetStateAction<boolean>>
	chatMessages: {
		id: string
		sender: string
		text: string
		time: Date
		isSelf: boolean
	}[]
	setChatMessages: Dispatch<
		SetStateAction<
			{
				id: string
				sender: string
				text: string
				time: Date
				isSelf: boolean
			}[]
		>
	>
	pushedTracks: {
		video?: string
		audio?: string
		screenshare?: string
	}
}

export function useRoomContext() {
	return useOutletContext<RoomContextType>()
}
