import invariant from 'tiny-invariant'
import aiReady from './sounds/AIReady.mp3'
import join from './sounds/Join.mp3'
import leave from './sounds/Leave.mp3'
import message from './sounds/Message.mp3'
import mute from './sounds/Mute.mp3'
import raiseHand from './sounds/RaiseHand.mp3'
import unmute from './sounds/Unmute.mp3'
import videoOff from './sounds/VideoOff.mp3'
import videoOn from './sounds/VideoOn.mp3'

const fetchOnce = async (...args: Parameters<typeof fetch>) => {
	invariant(
		!args.some((a) => a instanceof Request),
		'fetchOnce cannot cache with Request parameters'
	)
	const cache = new Map<string, Response>()
	const key = JSON.stringify(args)
	let result = cache.get(key)
	if (result) {
		return result.clone()
	} else {
		result = await fetch(...args)
		cache.set(key, result)
		return result.clone()
	}
}

const sounds = {
	leave,
	join,
	raiseHand,
	aiReady,
	message,
	mute,
	unmute,
	videoOn,
	videoOff,
}

const volumeMap = {
	join: 0.2,
	leave: 0.2,
	raiseHand: 0.1,
	aiReady: 0.1,
	message: 0.1,
	mute: 0.15,
	unmute: 0.15,
	videoOn: 0.15,
	videoOff: 0.15,
} satisfies Record<keyof typeof sounds, number>

import { getGlobalAudioContext } from '../audioContextManager'

export async function playSound(sound: keyof typeof sounds) {
	const arrayBuffer = await fetchOnce(sounds[sound]).then((res) =>
		res.arrayBuffer()
	)
	const context = getGlobalAudioContext()
	
	// Ensure the context is running
	if (context.state === 'suspended') {
		context.resume().catch(() => {})
	}
	
	const audioBuffer = await context.decodeAudioData(arrayBuffer)
	const source = context.createBufferSource()
	const gainNode = context.createGain()
	source.buffer = audioBuffer
	source.connect(gainNode)
	gainNode.connect(context.destination)
	gainNode.gain.setValueAtTime(volumeMap[sound], context.currentTime)
	source.start()
}
