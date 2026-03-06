import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from '~/utils/constants'
import getUsername from '~/utils/getUsername.server'

// handles get requests
export const loader = async ({
	request,
	context,
	params,
}: LoaderFunctionArgs) => {
	const username = await getUsername(request)
	if (username === null)
		throw new Response(null, {
			status: 401,
		})

	const { roomName } = params
	if (!roomName) return new Response('Room name required', { status: 400 })

	if (context.mode === 'development')
		request.headers.set(ACCESS_AUTHENTICATED_USER_EMAIL_HEADER, username)

	const rooms = context.env?.rooms ?? (context as any).rooms
	if (!rooms) return new Response('Rooms binding not found', { status: 500 })

	const id = rooms.idFromName(roomName)
	const stub = rooms.get(id)

	// Manually forward the request with the required headers
	const newRequest = new Request(request)
	newRequest.headers.set('x-partykit-room', roomName)
	newRequest.headers.set('x-partykit-namespace', 'rooms')

	return stub.fetch(newRequest)
}
