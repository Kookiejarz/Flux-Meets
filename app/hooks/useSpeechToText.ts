import { useEffect, useRef, useState } from 'react'

export interface SpeechToTextOptions {
	enabled: boolean
	onCaption: (text: string, isFinal: boolean) => void
	language?: string
}

// Normalize language codes for better compatibility with SpeechRecognition API
function normalizeLanguage(lang: string): string {
	// Common normalizations
	const normalized = lang.toLowerCase().trim()

	// Map common variants to standard BCP 47 codes
	if (normalized.startsWith('zh')) {
		// Default to zh-CN for Chinese
		return normalized.includes('tw') || normalized.includes('hk')
			? 'zh-TW'
			: 'zh-CN'
	}
	if (normalized.startsWith('en')) {
		// Default to en-US for English
		return 'en-US'
	}

	return lang
}

export function useSpeechToText({
	enabled,
	onCaption,
	language = 'zh-CN',
}: SpeechToTextOptions) {
	const recognitionRef = useRef<any>(null)
	const enabledRef = useRef(enabled)
	const onCaptionRef = useRef(onCaption)
	const isActiveRef = useRef(false)
	const shouldAutoRestartRef = useRef(true)
	const restartDelayMsRef = useRef(200)
	const restartTimerRef = useRef<number | null>(null)
	const unmountedRef = useRef(false)
	const [isSupported, setIsSupported] = useState(false)

	useEffect(() => {
		unmountedRef.current = false
		return () => {
			unmountedRef.current = true
		}
	}, [])

	useEffect(() => {
		enabledRef.current = enabled
		if (enabled) {
			shouldAutoRestartRef.current = true
			restartDelayMsRef.current = 200
		} else {
			// When disabled, stop recognition immediately
			shouldAutoRestartRef.current = false
			if (restartTimerRef.current !== null) {
				window.clearTimeout(restartTimerRef.current)
				restartTimerRef.current = null
			}
			const recognition = recognitionRef.current
			if (recognition) {
				try {
					console.log('[SpeechToText] Stopping recognition (enabled=false)')
					recognition.stop()
				} catch (e) {
					// Ignore
				}
			}
		}
	}, [enabled])

	useEffect(() => {
		onCaptionRef.current = onCaption
	}, [onCaption])

	useEffect(() => {
		const SpeechRecognition =
			(window as any).SpeechRecognition ||
			(window as any).webkitSpeechRecognition

		if (!SpeechRecognition) {
			console.warn('Speech Recognition API is not supported in this browser.')
			setIsSupported(false)
			return
		}

		setIsSupported(true)

		const normalizedLang = normalizeLanguage(language)
		console.log(
			'[SpeechToText] Creating new recognition with language:',
			normalizedLang,
			'(original:',
			language,
			')'
		)

		const recognition = new SpeechRecognition()
		recognition.continuous = true
		recognition.interimResults = true
		recognition.lang = normalizedLang

		recognition.onstart = () => {
			isActiveRef.current = true
			console.log(
				'[SpeechToText] Recognition started with language:',
				normalizedLang
			)
		}

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
				onCaptionRef.current(finalTranscript, true)
			} else if (interimTranscript) {
				onCaptionRef.current(interimTranscript, false)
			}
		}

		recognition.onerror = (event: any) => {
			if (event.error === 'aborted') return // Expected when stopping or browser pre-empting
			console.error('[SpeechToText] Recognition error:', event.error)

			// Fatal errors should not trigger infinite auto-restart loops
			if (
				event.error === 'not-allowed' ||
				event.error === 'service-not-allowed' ||
				event.error === 'audio-capture'
			) {
				shouldAutoRestartRef.current = false
			}
		}

		recognition.onend = () => {
			isActiveRef.current = false
			console.log('[SpeechToText] Recognition ended, will restart if enabled')
			// Restart if still enabled
			if (
				enabledRef.current &&
				shouldAutoRestartRef.current &&
				!unmountedRef.current
			) {
				const delay = restartDelayMsRef.current
				restartTimerRef.current = window.setTimeout(() => {
					restartTimerRef.current = null
					if (
						enabledRef.current &&
						!isActiveRef.current &&
						shouldAutoRestartRef.current &&
						!unmountedRef.current
					) {
						try {
							recognition.start()
							restartDelayMsRef.current = 200
						} catch (e) {
							console.warn('[SpeechToText] Failed to restart recognition:', e)
							restartDelayMsRef.current = Math.min(
								restartDelayMsRef.current * 2,
								2000
							)
						}
					}
				}, delay)
			}
		}

		recognitionRef.current = recognition

		// If enabled is true, start the new recognition immediately
		if (enabledRef.current) {
			try {
				console.log(
					'[SpeechToText] Starting recognition immediately (enabled=true)'
				)
				recognition.start()
			} catch (e) {
				console.warn('[SpeechToText] Failed to start recognition:', e)
			}
		}

		return () => {
			console.log('[SpeechToText] Cleaning up recognition')
			shouldAutoRestartRef.current = false
			enabledRef.current = false
			if (restartTimerRef.current !== null) {
				window.clearTimeout(restartTimerRef.current)
				restartTimerRef.current = null
			}
			recognition.onstart = null
			recognition.onresult = null
			recognition.onerror = null
			recognition.onend = null
			try {
				recognition.stop()
			} catch (e) {
				// Ignore
			}
			recognitionRef.current = null
		}
	}, [language])

	useEffect(() => {
		const handleVisibilityChange = () => {
			if (
				document.visibilityState === 'visible' &&
				enabledRef.current &&
				!isActiveRef.current
			) {
				const recognition = recognitionRef.current
				if (recognition) {
					try {
						recognition.start()
					} catch (e) {
						// Ignore
					}
				}
			}
		}

		document.addEventListener('visibilitychange', handleVisibilityChange)
		window.addEventListener('focus', handleVisibilityChange)

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange)
			window.removeEventListener('focus', handleVisibilityChange)
		}
	}, [])

	useEffect(() => {
		const recognition = recognitionRef.current
		if (!recognition) return

		if (enabled) {
			shouldAutoRestartRef.current = true
			if (!isActiveRef.current) {
				console.log(
					'[SpeechToText] Enabled changed to true, starting recognition'
				)
				try {
					recognition.start()
				} catch (e) {
					console.warn(
						'[SpeechToText] Failed to start recognition on enable:',
						e
					)
				}
			}
		} else {
			shouldAutoRestartRef.current = false
			console.log(
				'[SpeechToText] Enabled changed to false, stopping recognition'
			)
			try {
				recognition.stop()
			} catch (e) {
				// Ignore
			}
		}
	}, [enabled])

	return { isSupported }
}
