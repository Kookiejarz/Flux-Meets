import { commitSession, getSession } from '~/session'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from './constants'
import { safeRedirect } from './safeReturnUrl'

export async function setUsername(
	username: string,
	request: Request,
	returnUrl: string = '/'
) {
	const normalizedUsername = username.trim()
	if (!normalizedUsername) {
		throw safeRedirect('/set-username')
	}
	const session = await getSession(request.headers.get('Cookie'))
	session.set('username', normalizedUsername)
	throw safeRedirect(returnUrl, {
		headers: {
			'Set-Cookie': await commitSession(session),
		},
	})
}

/**
 * Utility for getting the username. In prod, this basically
 * just consists of getting the Cf-Access-Authenticated-User-Email
 * header, but in dev we allow manually setting this via the
 * username query param.
 */
export default async function getUsername(request: Request) {
	const accessUsername = request.headers.get(
		ACCESS_AUTHENTICATED_USER_EMAIL_HEADER
	)
	if (accessUsername?.trim()) return accessUsername.trim()

	const session = await getSession(request.headers.get('Cookie'))
	const sessionUsername = session.get('username')
	if (typeof sessionUsername === 'string' && sessionUsername.trim()) {
		return sessionUsername.trim()
	}

	return null
}
