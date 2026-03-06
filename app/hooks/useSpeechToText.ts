import { useEffect, useRef, useState } from 'react'

export interface SpeechToTextOptions {
	enabled: boolean
	onCaption: (text: string, isFinal: boolean) => void
	language?: string
}

export function useSpeechToText({
	enabled,
	onCaption,
	language = 'zh-CN',
}: SpeechToTextOptions) {
	const recognitionRef = useRef<any>(null)
	const [isSupported, setIsSupported] = useState(false)

	useEffect(() => {
		const SpeechRecognition =
			(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

		if (!SpeechRecognition) {
			console.warn('Speech Recognition API is not supported in this browser.')
			setIsSupported(false)
			return
		}

		setIsSupported(true)

		const recognition = new SpeechRecognition()
		recognition.continuous = true
		recognition.interimResults = true
		recognition.lang = language

		recognition.onresult = (event: any) => {
			let interimTranscript = ''
			let finalTranscript = ''

			for (let i = event.resultIndex; i < event.results.length; ++i) {
				if (event.results[i].isFinal) {
					finalTranscript += event.results[i][0].transcript
				} else {
					interimTranscript += event.results[i][0].transcript
				}
			}

			if (finalTranscript) {
				onCaption(finalTranscript, true)
			} else if (interimTranscript) {
				onCaption(interimTranscript, false)
			}
		}

		recognition.onerror = (event: any) => {
			console.error('Speech recognition error', event.error)
			if (event.error === 'not-allowed') {
				// Handle permission denied
			}
		}

		recognition.onend = () => {
			// Restart if still enabled
			if (enabled) {
				try {
					recognition.start()
				} catch (e) {
					// Ignore if already started
				}
			}
		}

		recognitionRef.current = recognition

		return () => {
			recognition.stop()
		}
	}, [language])

	useEffect(() => {
		const recognition = recognitionRef.current
		if (!recognition) return

		if (enabled) {
			try {
				recognition.start()
			} catch (e) {
				// Already started
			}
		} else {
			recognition.stop()
		}
	}, [enabled])

	return { isSupported }
}
