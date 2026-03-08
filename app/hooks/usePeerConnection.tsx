import {
	PartyTracks,
	setLogLevel,
	type PartyTracksConfig,
} from 'partytracks/client'
import { useObservableAsValue } from 'partytracks/react'
import { useEffect, useMemo, useState } from 'react'
import { useStablePojo } from './useStablePojo'

setLogLevel('debug')

export const usePeerConnection = (
	config: PartyTracksConfig & { generation?: number }
) => {
	const { generation, ...baseConfig } = config
	const stableConfig = useStablePojo(baseConfig)
	const partyTracks = useMemo(
		() => new PartyTracks(stableConfig),
		[stableConfig, generation]
	)
	const peerConnection = useObservableAsValue(partyTracks.peerConnection$)

	const [iceConnectionState, setIceConnectionState] =
		useState<RTCIceConnectionState>('new')

	useEffect(() => {
		if (!peerConnection) return
		setIceConnectionState(peerConnection.iceConnectionState)
		const iceConnectionStateChangeHandler = () => {
			setIceConnectionState(peerConnection.iceConnectionState)
		}
		peerConnection.addEventListener(
			'iceconnectionstatechange',
			iceConnectionStateChangeHandler
		)
		return () => {
			peerConnection.removeEventListener(
				'iceconnectionstatechange',
				iceConnectionStateChangeHandler
			)
		}
	}, [peerConnection])

	return {
		partyTracks,
		iceConnectionState,
	}
}
