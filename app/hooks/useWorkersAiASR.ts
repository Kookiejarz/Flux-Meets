import { useEffect, useRef, useState } from 'react'
import type { ClientMessage } from '~/types/Messages'

interface WorkersAiASROptions {
	enabled: boolean
	audioStreamTrack: MediaStreamTrack | null
	websocket: WebSocket
}

export function useWorkersAiASR({
	enabled,
	audioStreamTrack,
	websocket,
}: WorkersAiASROptions) {
	const recorderRef = useRef<MediaRecorder | null>(null)
	const [isSocketOpen, setIsSocketOpen] = useState(
		websocket.readyState === WebSocket.OPEN
	)

	useEffect(() => {
		const updateState = () => {
			setIsSocketOpen(websocket.readyState === WebSocket.OPEN)
		}

		updateState()
		websocket.addEventListener('open', updateState)
		websocket.addEventListener('close', updateState)
		websocket.addEventListener('error', updateState)

		return () => {
			websocket.removeEventListener('open', updateState)
			websocket.removeEventListener('close', updateState)
			websocket.removeEventListener('error', updateState)
		}
	}, [websocket])

	useEffect(() => {
		if (!enabled || !audioStreamTrack || !isSocketOpen) {
			if (recorderRef.current) {
				console.log('[WorkersAiASR] Stopping recorder:', { enabled, hasTrack: !!audioStreamTrack, isSocketOpen })
				recorderRef.current.stop()
				recorderRef.current = null
			}
			return
		}

		console.log('[WorkersAiASR] Starting recorder...', {
			trackId: audioStreamTrack.id,
			readyState: audioStreamTrack.readyState,
			enabled: audioStreamTrack.enabled,
		})

		try {
			if (typeof MediaRecorder === 'undefined') {
				console.warn('MediaRecorder is not available in this browser')
				return
			}

			const candidateMimeTypes = [
				'audio/webm;codecs=opus',
				'audio/webm',
				'audio/mp4',
			]
			const mimeType = candidateMimeTypes.find((type) =>
				typeof MediaRecorder.isTypeSupported === 'function'
					? MediaRecorder.isTypeSupported(type)
					: type === 'audio/webm;codecs=opus'
			)

			const stream = new MediaStream([audioStreamTrack])
			const recorder = mimeType
				? new MediaRecorder(stream, { mimeType })
				: new MediaRecorder(stream)

			recorder.ondataavailable = async (event) => {
				if (event.data.size > 0 && websocket.readyState === WebSocket.OPEN) {
					const reader = new FileReader()
					reader.onloadend = () => {
						const base64String = (reader.result as string).split(',')[1]
						websocket.send(
							JSON.stringify({
								type: 'audioChunk',
								data: base64String,
							} satisfies ClientMessage)
						)
					}
					reader.readAsDataURL(event.data)
				}
			}

			// Slice every 1.5 seconds for a balance between latency and accuracy
			recorder.start(1500)
			recorderRef.current = recorder
			console.log('[WorkersAiASR] ✅ Recorder started successfully')
		} catch (e) {
			console.error('Error starting Workers AI ASR Recorder:', e)
		}

		return () => {
			if (recorderRef.current) {
				console.log('[WorkersAiASR] Cleanup: stopping recorder')
				recorderRef.current.stop()
				recorderRef.current = null
			}
		}
	}, [enabled, audioStreamTrack, websocket, isSocketOpen])
}
