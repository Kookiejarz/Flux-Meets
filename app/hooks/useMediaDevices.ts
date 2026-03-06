import { useEffect } from 'react'
import { createGlobalState } from 'react-use'

const useMediaDevicesState = createGlobalState<MediaDeviceInfo[]>([])

export default function useMediaDevices(
	filter: (device: MediaDeviceInfo) => boolean = () => true
) {
	const [devices, setDevices] = useMediaDevicesState()
	const filterSource = filter.toString()

	useEffect(() => {
		let mounted = true
		const requestDevices = () => {
			navigator.mediaDevices.enumerateDevices().then((d) => {
				if (!mounted) return
				setDevices(d)

				// If we have devices but no labels, it might be because permissions were JUST granted.
				// Try one more time after a short delay.
				const hasDevices = d.length > 0
				const hasLabels = d.some((device) => device.label)
				if (hasDevices && !hasLabels) {
					setTimeout(() => {
						if (mounted) {
							navigator.mediaDevices.enumerateDevices().then((d2) => {
								if (mounted) setDevices(d2)
							})
						}
					}, 500)
				}
			})
		}
		navigator.mediaDevices.addEventListener('devicechange', requestDevices)
		requestDevices()
		return () => {
			mounted = false
			navigator.mediaDevices.removeEventListener('devicechange', requestDevices)
		}
	}, [filterSource, setDevices])

	return devices.filter(filter)
}
