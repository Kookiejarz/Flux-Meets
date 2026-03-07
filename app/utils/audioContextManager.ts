/**
 * Global AudioContext manager to handle suspended state
 * Automatically resumes all AudioContexts on user interaction
 */

let audioContexts: Set<AudioContext> = new Set()
let hasUserInteracted = false

// Events that indicate user interaction
const interactionEvents = ['click', 'touchstart', 'pointerdown', 'keydown']

function resumeAllContexts() {
	if (audioContexts.size === 0) return
	
	const promises = Array.from(audioContexts).map(async (ctx) => {
		if (ctx.state === 'suspended') {
			try {
				await ctx.resume()
				console.log('✅ AudioContext resumed by user interaction')
			} catch (err) {
				console.warn('Failed to resume AudioContext:', err)
			}
		}
	})
	
	return Promise.all(promises)
}

function handleUserInteraction() {
	if (hasUserInteracted) return
	hasUserInteracted = true
	
	console.log('👆 User interaction detected, resuming all AudioContexts')
	resumeAllContexts()
	
	// Remove listeners after first interaction
	interactionEvents.forEach((event) => {
		document.removeEventListener(event, handleUserInteraction)
	})
}

// Set up listeners on first import
if (typeof document !== 'undefined') {
	interactionEvents.forEach((event) => {
		document.addEventListener(event, handleUserInteraction, { once: true, passive: true })
	})
}

export function registerAudioContext(ctx: AudioContext) {
	audioContexts.add(ctx)
	
	// If user already interacted, try to resume immediately
	if (hasUserInteracted && ctx.state === 'suspended') {
		ctx.resume().catch(() => {})
	}
	
	return () => {
		audioContexts.delete(ctx)
	}
}

export function getHasUserInteracted() {
	return hasUserInteracted
}

let globalAudioContext: AudioContext | null = null

export function getGlobalAudioContext(): AudioContext {
	if (!globalAudioContext) {
		globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
		registerAudioContext(globalAudioContext)
	}
	return globalAudioContext
}
