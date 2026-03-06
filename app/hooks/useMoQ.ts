import { useEffect, useState, useRef } from 'react'

export interface MoQStatus {
	state: 'idle' | 'connecting' | 'connected' | 'error' | 'closed'
	error?: string
}

export function useMoQ(enabled: boolean) {
	const [status, setStatus] = useState<MoQStatus>({ state: 'idle' })
	const transportRef = useRef<any>(null)

	useEffect(() => {
		if (!enabled) {
			if (transportRef.current) {
				transportRef.current.close()
				transportRef.current = null
				setStatus({ state: 'idle' })
			}
			return
		}

		if (typeof (window as any).WebTransport === 'undefined') {
			setStatus({
				state: 'error',
				error: 'WebTransport is not supported in this browser.',
			})
			return
		}

		let isMounted = true
		const connect = async () => {
			setStatus({ state: 'connecting' })
			try {
				// Cloudflare MoQ Relay Draft-14 endpoint
				const url = 'https://draft-14.cloudflare.mediaoverquic.com'
				const transport = new (window as any).WebTransport(url)
				transportRef.current = transport

				await transport.ready
				if (isMounted) {
					setStatus({ state: 'connected' })
					console.log('🚀 MoQ: Connected to Cloudflare Relay')
				}

				transport.closed
					.then(() => {
						if (isMounted) setStatus({ state: 'closed' })
					})
					.catch((err: any) => {
						if (isMounted) setStatus({ state: 'error', error: err.message })
					})
			} catch (e: any) {
				if (isMounted) {
					setStatus({ state: 'error', error: e.message })
					console.error('❌ MoQ Connection Error:', e)
				}
			}
		}

		connect()

		return () => {
			isMounted = false
			if (transportRef.current) {
				transportRef.current.close()
				transportRef.current = null
			}
		}
	}, [enabled])

	return status
}
