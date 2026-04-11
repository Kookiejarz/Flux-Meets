import { describe, expect, it } from 'vitest'
import { sortVideoCodecPreferences } from './e2ee'

function createCodec(
	mimeType: string,
	sdpFmtpLine?: string
): RTCRtpCodec {
	return {
		mimeType,
		clockRate: 90_000,
		...(sdpFmtpLine ? { sdpFmtpLine } : {}),
	}
}

describe('sortVideoCodecPreferences', () => {
	it('prioritizes broadly compatible codecs before optional ones', () => {
		const codecs = [
			createCodec('video/rtx'),
			createCodec('video/H265'),
			createCodec('video/VP9'),
			createCodec('video/VP8'),
			createCodec('video/H264'),
			createCodec('video/ulpfec'),
		]

		const sorted = sortVideoCodecPreferences(codecs)

		expect(sorted.map((codec) => codec.mimeType)).toEqual([
			'video/H264',
			'video/VP8',
			'video/VP9',
			'video/H265',
			'video/rtx',
			'video/ulpfec',
		])
	})

	it('preserves the original order for codecs within the same family', () => {
		const baseline = createCodec('video/H264', 'profile-level-id=42e01f')
		const constrained = createCodec('video/H264', 'profile-level-id=42001f')

		const sorted = sortVideoCodecPreferences([
			createCodec('video/VP8'),
			baseline,
			constrained,
		])

		expect(sorted[0]).toBe(baseline)
		expect(sorted[1]).toBe(constrained)
	})
})
