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
	const [initTimeout, setInitTimeout] = useState(false)
	const [justGranted, setJustGranted] = useState(false) // 追踪是否刚刚授予权限

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

	// 等待设备真正开始广播后才显示子组件
	// 这避免了在移动设备上权限授予但设备尚未启动的问题
	const devicesReady = micIsBroadcasting || cameraIsBroadcasting
	// 只在刚授予权限时才启用，防止影响已有权限的情况
	useEffect(() => {
		if (permissionState === 'granted' && justGranted && !devicesReady) {
			const timer = setTimeout(() => {
				if (mountedRef.current && !micIsBroadcasting && !cameraIsBroadcasting) {
					console.error('Device initialization timeout')
					setInitTimeout(true)
				}
			}, 5000) // 减少到 5 秒
			return () => clearTimeout(timer)
		}
	}, [permissionState, justGranted, devicesReady, micIsBroadcasting, cameraIsBroadcasting])

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

	// 如果权限已经授予（刷新或重新进入），直接显示子组件
	// 只有在用户刚刚点击授权后才等待设备启动
	if (permissionState === 'granted' && (!justGranted || devicesReady)) {
		return props.children
	}

	// 设备初始化超时
	if (initTimeout) {
		return (
			<div className="grid items-center min-h-[100dvh] bg-zinc-950 text-zinc-100 p-6">
				<div className="mx-auto space-y-4 max-w-80 text-center">
					<h1 className="text-3xl font-black text-red-500 uppercase">
						Initialization Failed
					</h1>
					<p className="text-zinc-400 text-sm leading-relaxed">
						We were unable to start your camera or microphone within the expected time.
					</p>
					<div className="flex flex-col gap-2">
						<Button 
							className="w-full" 
							onClick={() => {
								console.log('User chose to skip and continue anyway')
								setInitTimeout(false)
								setJustGranted(false)
							}}
						>
							Continue Anyway
						</Button>
						<Button 
							className="w-full" 
							displayType="secondary"
							onClick={() => {
								window.location.reload()
							}}
						>
							Reload Page
						</Button>
					</div>
				</div>
			</div>
		)
	}

	// 正在初始化设备
	if (permissionState === 'granted' && !devicesReady) {
		return (
			<div className="grid items-center min-h-[100dvh] bg-zinc-950 text-zinc-100 p-6">
				<div className="mx-auto space-y-4 max-w-80 text-center">
					<div className="flex justify-center">
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
					</div>
					<h1 className="text-2xl font-black orange-glow-text uppercase">
						Starting Devices
					</h1>
					<p className="text-zinc-400 text-sm leading-relaxed">
						Initializing your camera and microphone...
					</p>
					<div className="text-xs text-zinc-600 space-y-1">
						<p>Mic: {micIsBroadcasting ? '✓ Ready' : '○ Waiting...'}</p>
						<p>Camera: {cameraIsBroadcasting ? '✓ Ready' : '○ Waiting...'}</p>
					</div>
					<Button 
						className="w-full mt-4" 
						displayType="secondary"
						onClick={() => {
							console.log('User chose to skip device initialization')
							setJustGranted(false)
						}}
					>
						Skip and Continue
					</Button>
				</div>
			</div>
		)
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
								
								// 防御性检查：确保代码只在客户端浏览器环境中运行
								if (typeof window === 'undefined' || !navigator.mediaDevices) {
									console.error('当前浏览器环境不支持访问媒体设备，请确保使用 HTTPS')
									if (mountedRef.current) setPermissionState('denied')
									return
								}
								
								// Safari is extremely sensitive to 'async' click handlers.
								// We call getUserMedia directly to trigger the prompt.
								navigator.mediaDevices
									.getUserMedia({ 
										audio: true, 
										video: { facingMode: 'user' } // 默认请求前置摄像头
									})
									.then(async (stream) => {
										console.log('getUserMedia success, stopping temp tracks...')
										// IMPORTANT: Stop the temporary tracks FIRST to release
										// the hardware before partytracks tries to acquire it.
										// On iOS Safari, holding the device while calling
										// getUserMedia again causes a NotReadableError.
										stream.getTracks().forEach((t) => t.stop())

										// Give iOS/mobile browsers time to fully release the camera/mic hardware
										console.log('Waiting for hardware release...')
										await new Promise((resolve) => setTimeout(resolve, 800))

										console.log('Starting broadcasting...')
										// Now start broadcasting — devices should be free
										mic.startBroadcasting()
										camera.startBroadcasting()

										// Set permission state and mark as just granted
										if (mountedRef.current) {
											console.log('Permission granted, waiting for devices to start...')
											setJustGranted(true) // 标记为刚刚授予
											setPermissionState('granted')
										}
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
