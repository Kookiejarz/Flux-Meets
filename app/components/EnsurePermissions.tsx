import { useEffect, useRef, useState, type ReactNode } from 'react'
import { camera, mic } from '~/hooks/useUserMedia'
import { Button } from './Button'

export interface EnsurePermissionsProps {
	children?: ReactNode
	onMicSelected: (deviceId: string) => void
	onCameraSelected: (deviceId: string) => void
}

type PermissionState = 'denied' | 'granted' | 'prompt' | 'unable-to-determine'

async function getExistingPermissionState(): Promise<PermissionState> {
	try {
		const query = await navigator.permissions.query({
			name: 'microphone' as any,
		})
		return query.state
	} catch (error) {
		return 'unable-to-determine'
	}
}

export function EnsurePermissions(props: EnsurePermissionsProps) {
	const [permissionState, setPermissionState] =
		useState<PermissionState | null>(null)

	const mountedRef = useRef(true)

	useEffect(() => {
		getExistingPermissionState().then((result) => {
			if (mountedRef.current) setPermissionState(result)
		})
		return () => {
			mountedRef.current = false
		}
	}, [])

	if (permissionState === null) return null

	if (permissionState === 'denied') {
		return (
			<div className="grid items-center h-full">
				<div className="mx-auto space-y-2 max-w-80 text-center">
					<h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
						Permission denied
					</h1>
					<p className="text-zinc-600 dark:text-zinc-400">
						You will need to go into your browser settings and manually
						re-enable permission for your camera and microphone.
					</p>
				</div>
			</div>
		)
	}

	if (
		permissionState === 'prompt' ||
		permissionState === 'unable-to-determine'
	) {
		return (
			<div className="grid items-center h-full">
				<div className="mx-auto max-w-80 text-center">
					<h1 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">
						Media Access
					</h1>
					<p className="mb-8 text-zinc-600 dark:text-zinc-400">
						In order to use Orange Meets, you will need to grant permission to
						your camera and microphone.
					</p>
					<Button
						className="w-full"
						onClick={() => {
							navigator.mediaDevices
								.getUserMedia({
									video: true,
									audio: {
										echoCancellation: true,
										noiseSuppression: true,
										autoGainControl: true,
									},
								})
								.then((ms) => {
									// Wait a tiny bit for the stream to stabilize before enumerating
									// This is crucial for iOS Safari to populate labels
									setTimeout(() => {
										navigator.mediaDevices.enumerateDevices().then((devices) => {
											// iOS Safari track.getSettings().deviceId can be undefined, so fallback to the first device of that kind
											const micId =
												ms.getAudioTracks()[0]?.getSettings().deviceId ||
												devices.find((d) => d.kind === 'audioinput' && d.deviceId)
													?.deviceId
											const cameraId =
												ms.getVideoTracks()[0]?.getSettings().deviceId ||
												devices.find((d) => d.kind === 'videoinput' && d.deviceId)
													?.deviceId

											if (micId) props.onMicSelected(micId)
											if (cameraId) props.onCameraSelected(cameraId)

											// Explicitly fire devicechange so useMediaDevices hook updates with labels
											navigator.mediaDevices.dispatchEvent(
												new Event('devicechange')
											)

											// Trigger partytracks broadcasting synchronously to preserve user gesture context
											mic.startBroadcasting()
											camera.startBroadcasting()

											// Stop the temporary tracks AFTER starting broadcasting to keep hardware active
											setTimeout(() => {
												ms.getTracks().forEach((t) => t.stop())
											}, 500)

											if (mountedRef.current) setPermissionState('granted')
										})
									}, 300)
								})
								.catch((err) => {
									console.error('Permission request failed:', err)
									if (mountedRef.current) setPermissionState('denied')
								})
						}}
					>
						Allow access
					</Button>
				</div>
			</div>
		)
	}

	return props.children
}
