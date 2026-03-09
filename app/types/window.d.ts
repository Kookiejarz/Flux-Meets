export {}

declare global {
	interface Window {
		ENV: {
			RELEASE?: string
		}
	}
}
