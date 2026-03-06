import type { ActionFunction, LoaderFunctionArgs } from '@remix-run/cloudflare'
import { json, redirect } from '@remix-run/cloudflare'
import {
	Form,
	useActionData,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import React, { useEffect, useState } from 'react'
import invariant from 'tiny-invariant'
import { Button } from '~/components/Button'
import { Disclaimer } from '~/components/Disclaimer'
import { Input } from '~/components/Input'
import { useDispatchToast } from '~/components/Toast'
import { useUserMetadata } from '~/hooks/useUserMetadata'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from '~/utils/constants'
import getUsername from '~/utils/getUsername.server'
import { cn } from '~/utils/style'

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const directoryUrl =
		context.env?.USER_DIRECTORY_URL ?? (context as any).USER_DIRECTORY_URL
	const username = await getUsername(request)
	invariant(username)
	const usedAccess = request.headers.has(ACCESS_AUTHENTICATED_USER_EMAIL_HEADER)
	return json({ username, usedAccess, directoryUrl })
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
			return json({ error: 'Server configuration error.' }, { status: 500 })
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
				return json({ error: 'Failed to create room.' }, { status: 500 })
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
				return json(
					{ error: 'Room not found or has expired.' },
					{ status: 404 }
				)
			}
			if (!response.ok) {
				console.error('Failed to check room existence:', response.status)
				return json({ error: 'Failed to join room.' }, { status: 500 })
			}
			return redirect(`/${targetRoom}`)
		}
	} catch (err) {
		console.error('Action error:', err)
		return json({ error: 'An unexpected error occurred.' }, { status: 500 })
	}
}

export default function Index() {
	const { username, usedAccess } = useLoaderData<typeof loader>()
	const actionData = useActionData<{ error?: string }>()
	const [searchParams] = useSearchParams()
	const dispatchToast = useDispatchToast()
	const { data } = useUserMetadata(username)
	const [roomNameInput, setRoomNameInput] = useState('')

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
		<div className="flex flex-col items-center justify-center h-full p-6 mx-auto group">
			<div className="flex-1"></div>

			<div className="w-full max-w-xl space-y-12">
				{/* Header Section */}
				<div className="text-center space-y-4 animate-float">
					<h1 className="text-6xl sm:text-7xl font-black orange-glow-text tracking-tighter transition-all duration-700 group-hover:tracking-normal">
						🎬 Flux Meet
					</h1>
					<div className="flex flex-col items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity duration-700">
						<p className="text-sm sm:text-base font-medium text-zinc-500 dark:text-zinc-400">
							Welcome back,{' '}
							<span className="text-orange-500">{data?.displayName}</span>
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
				<div className="opacity-0 group-hover:opacity-100 group-hover:animate-fade-in-up transition-all duration-1000 delay-100">
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
				<Disclaimer className="pt-12 opacity-20 hover:opacity-100 transition-opacity duration-1000 cursor-default" />
			</div>
		</div>
	)
}
