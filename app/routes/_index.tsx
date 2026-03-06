import type { ActionFunction, LoaderFunctionArgs } from '@remix-run/cloudflare'
import { json, redirect } from '@remix-run/cloudflare'
import { Form, useLoaderData, useNavigate } from '@remix-run/react'
import { nanoid } from 'nanoid'
import React, { useState } from 'react'
import invariant from 'tiny-invariant'
import { Button } from '~/components/Button'
import { Disclaimer } from '~/components/Disclaimer'
import { Input } from '~/components/Input'
import { useUserMetadata } from '~/hooks/useUserMetadata'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from '~/utils/constants'
import getUsername from '~/utils/getUsername.server'
import { cn } from '~/utils/style'

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const directoryUrl = context.USER_DIRECTORY_URL
	const username = await getUsername(request)
	invariant(username)
	const usedAccess = request.headers.has(ACCESS_AUTHENTICATED_USER_EMAIL_HEADER)
	return json({ username, usedAccess, directoryUrl })
}

export const action: ActionFunction = async ({ request }) => {
	const formData = await request.formData()
	const room = formData.get('room')
	const targetRoom = room && typeof room === 'string' && room.trim() !== ''
		? room.replace(/ /g, '-')
		: nanoid(8)
	return redirect(`/${targetRoom}`)
}

export default function Index() {
	const { username, usedAccess } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const { data } = useUserMetadata(username)
	const [roomNameInput, setRoomNameInput] = useState('')

	const isCreatingNew = roomNameInput.trim() === ''

	const handleClientSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		// Use client-side navigation if JS is loaded
		e.preventDefault()
		const targetRoom = isCreatingNew
			? nanoid(8)
			: roomNameInput.replace(/ /g, '-')
		navigate(`/${targetRoom}`)
	}

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
						onSubmit={handleClientSubmit}
						className="relative flex flex-col sm:flex-row gap-3 p-2 bg-white dark:bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-orange-500/5 focus-within:shadow-orange-500/20 focus-within:border-orange-500/50 transition-all duration-500"
					>
						<div className="relative flex-grow">
							<Input
								name="room"
								value={roomNameInput}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setRoomNameInput(e.target.value)
								}
								placeholder="Enter room name or leave blank..."
								className="w-full h-14 pl-6 bg-transparent border-none ring-0 focus:ring-0 text-lg font-medium placeholder:text-zinc-400"
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
						{isCreatingNew ? 'A random ID will be generated' : `Ready to join "${roomNameInput}"`}
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-end flex-1">
				<Disclaimer className="pt-12 opacity-20 hover:opacity-100 transition-opacity duration-1000 cursor-default" />
			</div>
		</div>
	)
}
