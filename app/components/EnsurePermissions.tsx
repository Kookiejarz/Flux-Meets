import { useEffect, useRef, useState, type ReactNode } from 'react'
import { camera, mic } from '~/hooks/useUserMedia'
import { Button } from './Button'
import { useObservableAsValue } from 'partytracks/react'

export interface EnsurePermissionsProps {
	children?: ReactNode
	onMicSelected: (deviceId: string) => void
	onCameraSelected: (deviceId: string) => void
}

type PermissionState = 'denied' | 'granted' | 'prompt' | 'unable-to-determine'

async function getExistingPermissionState(): Promise<PermissionState> {
	try {
		if (!navigator.permissions || !navigator.permissions.query) {
			return 'unable-to-determine'
		}
		const query = await navigator.permissions.query({
			name: 'microphone' as any,
		})
		return query.state as PermissionState
	} catch (error) {
		return 'unable-to-determine'
	}
}

export function EnsurePermissions(props: EnsurePermissionsProps) {
	const [permissionState, setPermissionState] =
		useState<PermissionState | null>(null)

	const mountedRef = useRef(true)

	// Monitor the broadcasting state of the global mic/camera objects
	const micIsBroadcasting = useObservableAsValue(mic.isBroadcasting$, false)
	const cameraIsBroadcasting = useObservableAsValue(camera.isBroadcasting$, false)
	const micActiveDevice = useObservableAsValue(mic.activeDevice$)
	const cameraActiveDevice = useObservableAsValue(camera.activeDevice$)

	useEffect(() => {
		getExistingPermissionState().then((result) => {
			if (mountedRef.current) setPermissionState(result)
		})
		return () => {
			mountedRef.current = false
		}
	}, [])

	// Sync device IDs back to parent
	useEffect(() => {
		if (micActiveDevice?.deviceId) {
			props.onMicSelected(micActiveDevice.deviceId)
		}
	}, [micActiveDevice, props])

	useEffect(() => {
		if (cameraActiveDevice?.deviceId) {
			props.onCameraSelected(cameraActiveDevice.deviceId)
		}
	}, [cameraActiveDevice, props])

	if (permissionState === 'granted') {
		return props.children
	}

	if (permissionState === 'denied') {
		return (
			<div className="grid items-center min-h-[100dvh] bg-zinc-950 text-zinc-100 p-6">
				<div className="mx-auto space-y-4 max-w-80 text-center">
					<h1 className="text-3xl font-black orange-glow-text uppercase">
						Access Denied
					</h1>
					<p className="text-zinc-400 text-sm leading-relaxed">
						You'll need to go into your browser settings and manually
						re-enable permission for your camera and microphone to join the meeting.
					</p>
					<Button className="w-full" onClick={() => window.location.reload()}>
						Try Reloading
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="grid items-center min-h-[100dvh] bg-zinc-950 text-zinc-100 p-6">
			<div className="mx-auto max-w-80 text-center space-y-8">
				<div className="space-y-4">
					<h1 className="text-4xl font-black orange-glow-text uppercase tracking-tighter">
						Media Access
					</h1>
					<p className="text-zinc-400 text-sm leading-relaxed">
						To join the call, Flux Meet needs access to your camera and microphone.
					</p>
				</div>
				
					<div className="relative group">
						<div className="absolute -inset-1 bg-gradient-to-r from-orange-600 to-orange-400 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
						<Button
							className="relative w-full h-14 text-lg font-black uppercase tracking-widest bg-orange-500 hover:bg-orange-600 border-none transition-all duration-300 z-50"
							onClick={() => {
								console.log('Allow access clicked')
								// Safari is extremely sensitive to 'async' click handlers.
								// We call getUserMedia directly to trigger the prompt.
								navigator.mediaDevices
									.getUserMedia({ audio: true, video: true })
									.then((stream) => {
										console.log('getUserMedia success')
										// Tell internal objects to start
										mic.startBroadcasting()
										camera.startBroadcasting()

										// On success, we can stop these temp tracks. 
										// Safari should keep the permission for the session now.
										stream.getTracks().forEach((t) => t.stop())
										
										if (mountedRef.current) setPermissionState('granted')
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
				
				<p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
					Secure & Encrypted Call
				</p>
			</div>
		</div>
	)
}
