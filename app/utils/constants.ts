export const ACCESS_AUTHENTICATED_USER_EMAIL_HEADER =
	'Cf-Access-Authenticated-User-Email'

export const RELEASE: string | undefined =
	// @ts-ignore
	typeof __RELEASE__ !== 'undefined' ? __RELEASE__ : undefined
