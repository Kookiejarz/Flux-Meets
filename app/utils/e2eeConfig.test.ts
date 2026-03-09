import { describe, expect, it } from 'vitest'
import { resolveE2EEConfig } from './e2eeConfig'

describe('resolveE2EEConfig', () => {
	it('defaults to enabled when E2EE_ENABLED is missing', () => {
		expect(resolveE2EEConfig(undefined, 'production')).toEqual({
			enabled: true,
			state: 'enabled',
		})
	})

	it('keeps non-production opt-out behavior', () => {
		expect(
			resolveE2EEConfig({ E2EE_ENABLED: 'false' }, 'development')
		).toEqual({
			enabled: false,
			state: 'disabled_by_env',
		})
	})

	it('marks production opt-out as misconfigured', () => {
		expect(
			resolveE2EEConfig({ E2EE_ENABLED: 'false' }, 'production')
		).toEqual({
			enabled: false,
			state: 'production_misconfigured',
		})
	})

	it('normalizes surrounding whitespace and casing', () => {
		expect(
			resolveE2EEConfig({ E2EE_ENABLED: ' FALSE ' }, 'production')
		).toEqual({
			enabled: false,
			state: 'production_misconfigured',
		})
	})
})
