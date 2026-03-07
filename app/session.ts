import { createCookieSessionStorage } from '@remix-run/cloudflare'

export const { getSession, commitSession, destroySession } =
	createCookieSessionStorage({
		// a Cookie from `createCookie` or the same CookieOptions to create one
		cookie: {
			name: '__session',
			secrets: ['oooOOooOOoOOoOOOOoo'],
			sameSite: 'lax',
			httpOnly: true,
			path: '/',
			maxAge: 60 * 60 * 24 * 30, // 30 days
		},
	})
