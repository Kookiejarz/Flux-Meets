import type { Mode } from '~/utils/mode'
import { mode } from '~/utils/mode'

export type E2EEConfigState =
	| 'enabled'
	| 'disabled_by_env'
	| 'production_misconfigured'

export function resolveE2EEConfig(
	env: { E2EE_ENABLED?: string | null } | undefined,
	currentMode: Mode = mode
): { enabled: boolean; state: E2EEConfigState } {
	const rawValue = env?.E2EE_ENABLED?.trim().toLowerCase()
	
	const enabled = currentMode === 'production' 
		? rawValue !== 'false' 
		: rawValue === 'true'

	if (enabled) {
		return {
			enabled: true,
			state: 'enabled',
		}
	}

	return {
		enabled: false,
		state:
			currentMode === 'production'
				? 'production_misconfigured'
				: 'disabled_by_env',
	}
}
