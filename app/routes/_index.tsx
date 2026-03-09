import type { ActionFunction, LoaderFunctionArgs } from '@remix-run/cloudflare'
import { data, redirect } from '@remix-run/cloudflare'
import {
	Form,
	useActionData,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import React, { useEffect, useState } from 'react'
import { Button } from '~/components/Button'
import { Disclaimer } from '~/components/Disclaimer'
import { Input } from '~/components/Input'
import { useDispatchToast } from '~/components/Toast'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from '~/utils/constants'
import getUsername from '~/utils/getUsername.server'
import { mode } from '~/utils/mode'
import { cn } from '~/utils/style'

type IndexLoaderData = {
	username: string
	usedAccess: boolean
	directoryUrl: string | undefined
	e2eeEnabled: boolean
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const env = context.env ?? (context as any)
	const directoryUrl = env?.USER_DIRECTORY_URL
	const e2eeEnabled = env?.E2EE_ENABLED === 'true' || mode === 'production'
	const username = await getUsername(request)

	// If no username after redirect, redirect to set-username again
	if (!username) {
		throw redirect(
			`/set-username?return-url=${encodeURIComponent(request.url)}`
		)
	}

	const usedAccess = request.headers.has(ACCESS_AUTHENTICATED_USER_EMAIL_HEADER)
	return data({ username, usedAccess, directoryUrl, e2eeEnabled })
}

export const action: ActionFunction = async ({ request, context }) => {
	try {
		const formData = await request.formData()
		const room = formData.get('room')
		const isNew = formData.get('isNew') === 'true'

		const targetRoom =
			room && typeof room === 'string' && room.trim() !== ''
				? room.replace(/ /g, '-')
				: crypto.randomUUID().slice(0, 8)

		const rooms = context.env?.rooms ?? (context as any).rooms
		if (!rooms) {
			console.error('Durable Object binding "rooms" not found in context.')
			return data({ error: 'Server configuration error.' }, { status: 500 })
		}

		const id = rooms.idFromName(targetRoom)
		const stub = rooms.get(id)

		if (isNew) {
			// Explicitly create the room
			const response = await stub.fetch('https://party/create', {
				method: 'POST',
				headers: {
					'x-partykit-room': targetRoom,
					'x-partykit-namespace': 'rooms',
				},
			})
			if (!response.ok) {
				const errorText = await response.text()
				console.error('Failed to create room in DO:', errorText)
				return data({ error: 'Failed to create room.' }, { status: 500 })
			}
			return redirect(`/${targetRoom}`)
		} else {
			// Check if room exists
			const response = await stub.fetch('https://party/exists', {
				headers: {
					'x-partykit-room': targetRoom,
					'x-partykit-namespace': 'rooms',
				},
			})
			if (response.status === 404) {
				return data(
					{ error: 'Room not found or has expired.' },
					{ status: 404 }
				)
			}
			if (!response.ok) {
				console.error('Failed to check room existence:', response.status)
				return data({ error: 'Failed to join room.' }, { status: 500 })
			}
			return redirect(`/${targetRoom}`)
		}
	} catch (err) {
		console.error('Action error:', err)
		return data({ error: 'An unexpected error occurred.' }, { status: 500 })
	}
}

export default function Index() {
	const { username, usedAccess, e2eeEnabled } = useLoaderData<IndexLoaderData>()
	const actionData = useActionData<{ error?: string }>()
	const [searchParams] = useSearchParams()
	const dispatchToast = useDispatchToast()
	const [roomNameInput, setRoomNameInput] = useState('')
	const normalizedUsername = username?.trim()
	const effectiveDisplayName = normalizedUsername || 'there'

	const isCreatingNew = roomNameInput.trim() === ''

	useEffect(() => {
		const error = searchParams.get('error') || actionData?.error
		if (error) {
			const message =
				error === 'room-not-found' ? 'Room not found or has expired.' : error
			dispatchToast(message, { id: 'room-error' })
		}
	}, [searchParams, actionData, dispatchToast])

	return (
		<div className="flex flex-col items-center justify-center h-full p-6 mx-auto">
			<div className="flex-1"></div>

			<div className="w-full max-w-xl space-y-12">
				{/* Header Section */}
				<div className="text-center space-y-4 animate-float">
					<h1 className="text-6xl sm:text-7xl font-black orange-glow-text tracking-tighter">
						🎬 Flux Meets
					</h1>
					<div className="flex flex-col items-center gap-2">
						<p className="text-sm sm:text-base font-medium text-zinc-500 dark:text-zinc-400">
							Welcome back,{' '}
							<span className="text-orange-500">{effectiveDisplayName}</span>
						</p>
						<p className="text-[11px] text-zinc-400 dark:text-zinc-500">
							{e2eeEnabled
								? 'E2EE check will run before entering the meeting room.'
								: 'E2EE is currently disabled in this environment.'}
						</p>
						{!usedAccess && (
							<a
								className="text-xs underline text-zinc-400 hover:text-orange-500 transition-colors"
								href="/set-username"
							>
								Not you? Change user
							</a>
						)}
					</div>
				</div>

				{/* Unified Action Bar */}
				<div className="animate-fade-in-up">
					<Form
						method="post"
						className="relative flex flex-col sm:flex-row gap-3 p-2 bg-white dark:bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-orange-500/5 focus-within:shadow-orange-500/20 focus-within:border-orange-500/50 transition-all duration-500"
					>
						<input type="hidden" name="isNew" value={String(isCreatingNew)} />
						<div className="relative flex-grow">
							<Input
								name="room"
								value={roomNameInput}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setRoomNameInput(e.target.value)
								}
								placeholder="Enter room name or leave blank..."
								className="w-full h-14 pl-6 bg-transparent border-none ring-0 focus:ring-0 text-lg font-medium placeholder:text-zinc-400 rounded-2xl"
							/>
						</div>
						<Button
							type="submit"
							className={cn(
								'h-14 px-8 rounded-2xl text-sm font-black transition-all duration-500 transform active:scale-95',
								isCreatingNew
									? 'bg-orange-500 text-white border-none'
									: 'bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 border-none'
							)}
						>
							{isCreatingNew ? 'CREATE NEW ROOM' : 'JOIN ROOM'}
						</Button>
					</Form>
					<p className="mt-4 text-center text-[10px] uppercase tracking-[0.3em] text-zinc-400 font-bold h-4">
						{isCreatingNew
							? '© Yunheng Liu | 2026'
							: `Ready to join "${roomNameInput}"`}
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-end flex-1">
				<Disclaimer className="pt-12 opacity-40 hover:opacity-100 transition-opacity duration-500 cursor-default" />
			</div>
		</div>
	)
}
