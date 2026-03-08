const encoder = new TextEncoder()
const decoder = new TextDecoder()
const keyCache = new Map<string, CryptoKey>()

async function deriveKey(safetyNumber: string): Promise<CryptoKey> {
	if (keyCache.has(safetyNumber)) return keyCache.get(safetyNumber)!
	const material = encoder.encode(safetyNumber)
	const hash = await crypto.subtle.digest('SHA-256', material)
	const key = await crypto.subtle.importKey(
		'raw',
		hash,
		{ name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt']
	)
	keyCache.set(safetyNumber, key)
	return key
}

function toBase64(data: Uint8Array): string {
	let binary = ''
	data.forEach((b) => (binary += String.fromCharCode(b)))
	return btoa(binary)
}

// Use ArrayBuffer rather than ArrayBufferLike so the result fits the stricter
// BufferSource constraint that subtle.decrypt expects.
function fromBase64(data: string): Uint8Array<ArrayBuffer> {
	const binary = atob(data)
	const buffer = new ArrayBuffer(binary.length)
	const arr = new Uint8Array(buffer)
	for (let i = 0; i < binary.length; i++) {
		arr[i] = binary.charCodeAt(i)
	}
	return arr
}

export async function encryptChat(
	plainText: string,
	safetyNumber: string
): Promise<{ ciphertext: string; iv: string }> {
	const key = await deriveKey(safetyNumber)
	const ivBytes = crypto.getRandomValues(new Uint8Array(12))
	const cipherBuf = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: ivBytes },
		key,
		encoder.encode(plainText)
	)
	return {
		ciphertext: toBase64(new Uint8Array(cipherBuf)),
		iv: toBase64(ivBytes),
	}
}

export async function decryptChat(
	ciphertext: string,
	iv: string,
	safetyNumber: string
): Promise<string | null> {
	try {
		const key = await deriveKey(safetyNumber)
		const ivBytes = fromBase64(iv)
		const cipherBytes = fromBase64(ciphertext)
		const plainBuf = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: ivBytes },
			key,
			cipherBytes as BufferSource
		)
		return decoder.decode(plainBuf)
	} catch (err) {
		console.error('Decrypt chat failed', err)
		return null
	}
}
