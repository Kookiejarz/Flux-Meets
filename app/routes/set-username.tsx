import { type ActionFunctionArgs } from '@remix-run/cloudflare'
import { Form } from '@remix-run/react'
import React, { useState } from 'react'
import invariant from 'tiny-invariant'
import { Button } from '~/components/Button'
import { Disclaimer } from '~/components/Disclaimer'
import { Input } from '~/components/Input'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from '~/utils/constants'
import { setUsername } from '~/utils/getUsername.server'
import { safeRedirect } from '~/utils/safeReturnUrl'
import { cn } from '~/utils/style'

export const action = async ({ request }: ActionFunctionArgs) => {
	const url = new URL(request.url)
	const returnUrl = url.searchParams.get('return-url') ?? '/'
	const accessUsername = request.headers.get(
		ACCESS_AUTHENTICATED_USER_EMAIL_HEADER
	)
	if (accessUsername) throw safeRedirect(returnUrl)
	const { username } = Object.fromEntries(await request.formData())
	invariant(typeof username === 'string')
	return setUsername(username, request, returnUrl)
}

export default function SetUsername() {
	const [nameInput, setNameInput] = useState('')

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
							How would you like to be known?
						</p>
					</div>
				</div>

				{/* Unified Action Bar */}
				<div className="animate-fade-in-up transition-all duration-1000">
					<Form
						method="post"
						className="relative flex flex-col sm:flex-row gap-3 p-2 bg-white dark:bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-orange-500/5 focus-within:shadow-orange-500/20 focus-within:border-orange-500/50 transition-all duration-500"
					>
						<div className="relative flex-grow">
							<Input
								autoComplete="off"
								autoFocus
								required
								id="username"
								name="username"
								value={nameInput}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setNameInput(e.target.value)
								}
								onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
									if (e.key === 'Enter' && nameInput.trim() !== '') {
										e.currentTarget.form?.requestSubmit()
									}
								}}
								placeholder="Enter your display name..."
								className="w-full h-14 pl-6 bg-transparent border-none ring-0 focus:ring-0 text-lg font-medium placeholder:text-zinc-400"
							/>
						</div>
						<Button
							type="submit"
							className={cn(
								'h-14 px-8 rounded-2xl text-sm font-black transition-all duration-500 transform active:scale-95',
								nameInput.trim() !== ''
									? 'bg-orange-500 text-white border-none'
									: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 border-none'
							)}
							disabled={nameInput.trim() === ''}
						>
							LET'S GO
						</Button>
					</Form>
					<p className="mt-4 text-center text-[10px] uppercase tracking-[0.3em] text-zinc-400 font-bold">
						Your display name is how you'll be identified in rooms. You can
						change it later if you want!
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-end flex-1">
				<Disclaimer className="pt-12 opacity-20 hover:opacity-100 transition-opacity duration-1000 cursor-default" />
			</div>
		</div>
	)
}
