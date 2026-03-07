import {
	json,
	type LinksFunction,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/cloudflare'
import {
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
} from '@remix-run/react'
import { parse } from 'cookie'
import type { FC, ReactNode } from 'react'
import React, { useRef } from 'react'
import { useFullscreen, useToggle } from 'react-use'

import { QueryClient, QueryClientProvider } from 'react-query'
import Toast from '~/components/Toast'
import tailwind from '~/styles/tailwind.css'
import { elementNotContainedByClickTarget } from './utils/elementNotContainedByClickTarget'
import getUsername from './utils/getUsername.server'
import { safeRedirect } from './utils/safeReturnUrl'
import { cn } from './utils/style'

function addOneDay(date: Date): Date {
	const result = new Date(date)
	result.setTime(result.getTime() + 24 * 60 * 60 * 1000)
	return result
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const url = new URL(request.url)
	const username = await getUsername(request)
	if (!username && url.pathname !== '/set-username') {
		const redirectUrl = new URL(url)
		redirectUrl.pathname = '/set-username'
		redirectUrl.searchParams.set('return-url', request.url)
		throw safeRedirect(redirectUrl.toString())
	}

	const env = (context as any).env || context
	const defaultResponse = json({
		userDirectoryUrl: env.USER_DIRECTORY_URL ?? '',
		backgroundImageUrl: env.BACKGROUND_IMAGE_URL ?? '',
	})

	// we only care about verifying token freshness if request was a user
	// initiated document request.
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-Fetch-User
	const secFetchUser = request.headers.get('Sec-Fetch-User')
	if (secFetchUser !== '?1') return defaultResponse
	const cookiesHeader = request.headers.get('Cookie')
	if (!cookiesHeader) return defaultResponse
	const { CF_Authorization } = parse(cookiesHeader)
	if (!CF_Authorization) return defaultResponse

	const [, payload] = CF_Authorization.split('.')
	const data = JSON.parse(atob(payload))
	const expires = new Date(data.exp * 1000)
	const now = new Date()
	if (addOneDay(now) > expires) {
		const headers = new Headers()
		;['CF_Authorization', 'CF_AppSession'].forEach((cookieName) =>
			headers.append(
				'Set-Cookie',
				`${cookieName}=; Expires=${new Date(0).toUTCString()}; Path=/;`
			)
		)

		throw safeRedirect(request.url, { headers })
	}

	return defaultResponse
}

export const meta: MetaFunction = () => [
	{
		title: '🎬 Flux Meet',
	},
]

export const links: LinksFunction = () => [
	{ rel: 'stylesheet', href: tailwind },
	{
		rel: 'apple-touch-icon',
		sizes: '256x256',
		href: '/clapper-256.ico?v=orange-emoji',
	},
	{
		rel: 'icon',
		type: 'image/x-icon',
		sizes: '32x32',
		href: '/clapper-32.ico?v=orange-emoji',
	},
	{
		rel: 'icon',
		type: 'image/x-icon',
		sizes: '16x16',
		href: '/clapper-16.ico?v=orange-emoji',
	},
	{
		rel: 'manifest',
		href: '/site.webmanifest',
		crossOrigin: 'use-credentials',
	},
	{
		rel: 'shortcut icon',
		href: '/favicon-64.ico?v=orange',
	},
]

const Document: FC<{ children?: ReactNode; backgroundImageUrl?: string }> = ({
	children,
	backgroundImageUrl,
}) => {
	const fullscreenRef = useRef<HTMLBodyElement>(null)
	const [fullscreenEnabled, toggleFullscreen] = useToggle(false)
	useFullscreen(
		fullscreenRef as React.RefObject<HTMLBodyElement>,
		fullscreenEnabled,
		{
			onClose: () => toggleFullscreen(false),
		}
	)
	return (
		// some extensions add data attributes to the html
		// element that React complains about.
		<html className="h-full" lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="apple-mobile-web-app-title" content="Orange Meets" />
				<meta name="application-name" content="Orange Meets" />
				<meta name="msapplication-TileColor" content="#ffffff" />
				<meta
					name="theme-color"
					content="#ffffff"
					media="(prefers-color-scheme: light)"
				/>
				<meta
					name="theme-color"
					content="#232325"
					media="(prefers-color-scheme: dark)"
				/>
				<Meta />
				<Links />
			</head>
			<body
				className={cn(
					'h-full',
					backgroundImageUrl
						? 'bg-zinc-950 text-zinc-200'
						: 'bg-white text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
					'overflow-hidden'
				)}
				ref={fullscreenRef}
				onDoubleClick={(e) => {
					if (
						e.target instanceof HTMLElement &&
						!elementNotContainedByClickTarget(e.target)
					)
						toggleFullscreen()
				}}
			>
				{/* Global Background Layer */}
				{backgroundImageUrl && (
					<div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
						<div
							className="absolute inset-0 bg-cover bg-center animate-bg-zoom opacity-60 dark:opacity-50 transition-opacity duration-1000"
							style={{
								backgroundImage: `url("${backgroundImageUrl}")`,
								backgroundColor: '#000',
							}}
						/>
						<div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-transparent to-zinc-950/80" />
						<div className="absolute inset-0 backdrop-blur-[2px]" />
					</div>
				)}

				{children}
				<ScrollRestoration />
				<div className="hidden" suppressHydrationWarning>
					{/* Replaced in entry.server.ts */}
					__CLIENT_ENV__
				</div>
				<Scripts />
				<LiveReload />
			</body>
		</html>
	)
}

export const ErrorBoundary = () => {
	return (
		<Document>
			<div className="grid h-full place-items-center">
				<p>
					It looks like there was an error, but don't worry it has been
					reported. Sorry about that!
				</p>
			</div>
		</Document>
	)
}

const queryClient = new QueryClient()

export default function App() {
	const { userDirectoryUrl, backgroundImageUrl } =
		useLoaderData<typeof loader>()
	return (
		<Toast.Provider>
			<Document backgroundImageUrl={backgroundImageUrl}>
				<div
					id="root"
					className={cn('h-full isolate', !backgroundImageUrl && 'bg-inherit')}
				>
					<QueryClientProvider client={queryClient}>
						<Outlet
							context={{
								userDirectoryUrl,
							}}
						/>
					</QueryClientProvider>
					<Toast.Viewport />
				</div>
			</Document>
		</Toast.Provider>
	)
}
