import { useEffect, useRef } from 'react'
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

	useEffect(() => {
		if (
			!enabled ||
			!audioStreamTrack ||
			websocket.readyState !== WebSocket.OPEN
		) {
			if (recorderRef.current) {
				recorderRef.current.stop()
				recorderRef.current = null
			}
			return
		}

		try {
			const stream = new MediaStream([audioStreamTrack])
			// Nova-3 prefers WAV/WebM formats.
			const recorder = new MediaRecorder(stream, {
				mimeType: 'audio/webm;codecs=opus',
			})

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
		} catch (e) {
			console.error('Error starting Workers AI ASR Recorder:', e)
		}

		return () => {
			if (recorderRef.current) {
				recorderRef.current.stop()
				recorderRef.current = null
			}
		}
	}, [enabled, audioStreamTrack, websocket])
}
