import { getCamera, getMic, getScreenshare } from 'partytracks/client'
import { useObservable, useObservableAsValue } from 'partytracks/react'
import { useCallback, useEffect, useState } from 'react'
import { useLocalStorage } from 'react-use'
import blurVideoTrack from '~/utils/blurVideoTrack'
import noiseSuppression from '~/utils/noiseSuppression'

export const errorMessageMap = {
	NotAllowedError:
		'Permission was denied. Grant permission and reload to enable.',
	NotFoundError: 'No device was found.',
	NotReadableError: 'Device is already in use.',
	OverconstrainedError: 'No device was found that meets constraints.',
	DevicesExhaustedError: 'All devices failed to initialize.',
	UnknownError: 'An unknown error occurred.',
}

type UserMediaError = keyof typeof errorMessageMap

const broadcastByDefault = false
export const mic = getMic({
	broadcasting: false,
	constraints: {
		echoCancellation: true,
		noiseSuppression: true,
		autoGainControl: true,
	},
})
export const camera = getCamera({
	broadcasting: false,
	constraints: { width: { ideal: 1280 }, height: { ideal: 720 } },
})
export const screenshare = getScreenshare({ audio: false })

function useNoiseSuppression() {
	const [suppressNoise, setSuppressNoise] = useLocalStorage(
		'suppress-noise',
		true
	)
	useEffect(() => {
		if (suppressNoise) mic.addTransform(noiseSuppression)
		return () => {
			mic.removeTransform(noiseSuppression)
		}
	}, [suppressNoise])

	return [suppressNoise, setSuppressNoise] as const
}

function useBlurVideo() {
	const [blurVideo, setBlurVideo] = useLocalStorage('blur-video', false)
	useEffect(() => {
		if (blurVideo) camera.addTransform(blurVideoTrack)
		return () => {
			camera.removeTransform(blurVideoTrack)
		}
	}, [blurVideo])

	return [blurVideo, setBlurVideo] as const
}

function useScreenshare() {
	const screenShareIsBroadcasting = useObservableAsValue(
		screenshare.video.isBroadcasting$,
		false
	)
	const startScreenShare = useCallback(() => {
		screenshare.startBroadcasting()
	}, [])
	const endScreenShare = useCallback(() => {
		screenshare.stopBroadcasting()
	}, [])

	return {
		screenShareEnabled: screenShareIsBroadcasting,
		startScreenShare,
		endScreenShare,
		screenShareVideoTrack$: screenshare.video.broadcastTrack$,
		screenShareVideoTrack: useObservableAsValue(
			screenshare.video.broadcastTrack$
		),
	}
}

export default function useUserMedia(options: {
	micDeviceId?: string
	cameraDeviceId?: string
}) {
	useEffect(() => {
		if (!options.micDeviceId) return
		navigator.mediaDevices
			.enumerateDevices()
			.then((ds) => ds.find((d) => d.deviceId === options.micDeviceId))
			.then((d) => {
				d && mic.setPreferredDevice(d)
			})
	}, [options.micDeviceId])
	useEffect(() => {
		if (!options.cameraDeviceId) return
		navigator.mediaDevices
			.enumerateDevices()
			.then((ds) => ds.find((d) => d.deviceId === options.cameraDeviceId))
			.then((d) => {
				d && camera.setPreferredDevice(d)
			})
	}, [options.cameraDeviceId])

	const [suppressNoise, setSuppressNoise] = useNoiseSuppression()
	const [blurVideo, setBlurVideo] = useBlurVideo()

	const [videoUnavailableReason, setVideoUnavailableReason] =
		useState<UserMediaError>()
	const [audioUnavailableReason, setAudioUnavailableReason] =
		useState<UserMediaError>()

	const {
		endScreenShare,
		startScreenShare,
		screenShareEnabled,
		screenShareVideoTrack,
		screenShareVideoTrack$,
	} = useScreenshare()

	const micDevices = useObservableAsValue(mic.devices$, [])
	const cameraDevices = useObservableAsValue(camera.devices$, [])

	useObservable(mic.broadcastTrack$, (t) => {
		if (t) setAudioUnavailableReason(undefined)
	})
	useObservable(camera.broadcastTrack$, (t) => {
		if (t) setVideoUnavailableReason(undefined)
	})

	useEffect(() => {
		// Auto-start if possible. This handles cases where permission was already granted.
		// Use a short delay to avoid racing with EnsurePermissions on iOS Safari,
		// where the hardware may not yet be released from the temp getUserMedia stream.
		const timeout = setTimeout(() => {
			mic.startBroadcasting()
			camera.startBroadcasting()
		}, 100)
		return () => clearTimeout(timeout)
	}, [])

	useObservable(mic.error$, (e) => {
		const reason =
			e.name in errorMessageMap ? (e.name as UserMediaError) : 'UnknownError'
		if (reason === 'UnknownError') {
			console.error('Unknown error getting audio track: ', e)
		}
		setAudioUnavailableReason(reason)
		mic.stopBroadcasting()
	})

	useObservable(camera.error$, (e) => {
		const reason =
			e.name in errorMessageMap ? (e.name as UserMediaError) : 'UnknownError'
		if (reason === 'UnknownError') {
			console.error('Unknown error getting video track: ', e)
		}
		setVideoUnavailableReason(reason)
		camera.stopBroadcasting()
	})

	const turnMicOn = useCallback(() => {
		setAudioUnavailableReason(undefined)
		mic.startBroadcasting()
	}, [])

	const turnCameraOn = useCallback(() => {
		setVideoUnavailableReason(undefined)
		camera.startBroadcasting()
	}, [])

	return {
		turnMicOn,
		turnMicOff: mic.stopBroadcasting,
		audioStreamTrack: useObservableAsValue(mic.broadcastTrack$),
		audioMonitorStreamTrack: useObservableAsValue(mic.localMonitorTrack$),
		audioEnabled: useObservableAsValue(mic.isBroadcasting$, broadcastByDefault),
		audioUnavailableReason,
		publicAudioTrack$: mic.broadcastTrack$,
		privateAudioTrack$: mic.localMonitorTrack$,
		audioDeviceId: useObservableAsValue(mic.activeDevice$)?.deviceId,
		setAudioDeviceId: (deviceId: string) => {
			const found = micDevices.find((d) => d.deviceId === deviceId)
			if (found) mic.setPreferredDevice(found)
		},

		setVideoDeviceId: (deviceId: string) => {
			const found = cameraDevices.find((d) => d.deviceId === deviceId)
			if (found) camera.setPreferredDevice(found)
		},
		videoDeviceId: useObservableAsValue(camera.activeDevice$)?.deviceId,
		turnCameraOn,
		turnCameraOff: camera.stopBroadcasting,
		videoEnabled: useObservableAsValue(camera.isBroadcasting$, true),
		videoUnavailableReason,
		blurVideo,
		setBlurVideo,
		suppressNoise,
		setSuppressNoise,
		videoTrack$: camera.broadcastTrack$,
		videoStreamTrack: useObservableAsValue(camera.broadcastTrack$),

		startScreenShare,
		endScreenShare,
		screenShareVideoTrack,
		screenShareEnabled,
		screenShareVideoTrack$,
	}
}

export type UserMedia = ReturnType<typeof useUserMedia>
