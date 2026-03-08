import './app/polyfills.server'
// @ts-ignore
import {
	getAssetFromKV,
	MethodNotAllowedError,
	NotFoundError,
} from '@cloudflare/kv-asset-handler'
import type { AppLoadContext, ServerBuild } from '@remix-run/cloudflare'
import { createRequestHandler } from '@remix-run/cloudflare'
import { inArray, sql } from 'drizzle-orm'
import * as build from '@remix-run/dev/server-build'
// @ts-expect-error
import manifestJSON from '__STATIC_CONTENT_MANIFEST'
import {
	AnalyticsSimpleCallFeedback,
	getDb,
	Meetings,
	Transcripts,
} from 'schema'
import { mode } from '~/utils/mode'
import { queue } from './app/queue'

import type { Env } from '~/types/Env'

// Must be top-level exports for Cloudflare Workers
export { ChatRoom } from './app/durableObjects/ChatRoom.server'
export { queue } from './app/queue'

const baseRemixHandler = createRequestHandler(build, mode)

export const remixHandler = async (request: Request, env: AppLoadContext) => {
	const response = await baseRemixHandler(request, { ...env, mode })

	if (mode === 'development') {
		const contentType = response.headers.get('Content-Type')
		if (contentType?.includes('text/html')) {
			const updated = new Response(response.body, response)
			updated.headers.set('Cache-Control', 'no-store')
			return updated
		}
	}

	return response
}

const notImplemented = () => {
	throw new Error('Not implemented')
}

const defaultMeetingRetentionMinutes = 12 * 60

const getMeetingRetentionMinutes = (env: Env): number => {
	const parsed = Number(env.MEETING_RETENTION_MINUTES)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return defaultMeetingRetentionMinutes
	}
	return Math.floor(parsed)
}

const cleanupExpiredMeetings = async (env: Env): Promise<number> => {
	const db = getDb({ env })
	if (!db) return 0

	const retentionMinutes = getMeetingRetentionMinutes(env)
	const expiredMeetings = await db
		.select({ id: Meetings.id })
		.from(Meetings)
		.where(
			sql`(
				${Meetings.ended} IS NOT NULL
				AND ${Meetings.ended} <= datetime('now', '-' || ${retentionMinutes} || ' minutes')
			) OR (
				${Meetings.ended} IS NULL
				AND ${Meetings.modified} <= datetime('now', '-' || ${retentionMinutes} || ' minutes')
			)`
		)

	if (expiredMeetings.length === 0) return 0

	const expiredMeetingIds = expiredMeetings.map((meeting) => meeting.id)

	await db
		.delete(Transcripts)
		.where(inArray(Transcripts.meetingId, expiredMeetingIds))
		.run()

	await db
		.delete(Meetings)
		.where(inArray(Meetings.id, expiredMeetingIds))
		.run()

	await db.delete(Meetings).where(inArray(Meetings.id, expiredMeetingIds)).run()

	return expiredMeetingIds.length
}

export const createKvAssetHandler = (ASSET_MANIFEST: Record<string, string>) =>
	async function handleAsset(
		request: Request,
		env: any,
		ctx: any,
		build: ServerBuild
	) {
		const ASSET_NAMESPACE = env.__STATIC_CONTENT

		// Apparently it's fine to fake this event to use with modules format
		// https://github.com/cloudflare/kv-asset-handler#es-modules
		const event = Object.assign(new Event('fetch'), {
			request,
			waitUntil(promise: Promise<unknown>) {
				return ctx.waitUntil(promise)
			},
			// These shouldn't be used
			respondWith: notImplemented,
			passThroughOnException: notImplemented,
		})

		try {
			if (mode === 'development') {
				return await getAssetFromKV(event, {
					cacheControl: {
						bypassCache: true,
					},
					ASSET_MANIFEST,
					ASSET_NAMESPACE,
				})
			}

			let cacheControl = {}
			let url = new URL(event.request.url)
			let assetpath = build.assets.url.split('/').slice(0, -1).join('/')
			let requestpath = url.pathname.split('/').slice(0, -1).join('/')

			if (requestpath.startsWith(assetpath)) {
				// Assets are hashed by Remix so are safe to cache in the browser
				// And they're also hashed in KV storage, so are safe to cache on the edge
				cacheControl = {
					bypassCache: false,
					edgeTTL: 31536000,
					browserTTL: 31536000,
				}
			} else {
				// Assets are not necessarily hashed in the request URL, so we cannot cache in the browser
				// But they are hashed in KV storage, so we can cache on the edge
				cacheControl = {
					bypassCache: false,
					edgeTTL: 31536000,
				}
			}

			return await getAssetFromKV(event, {
				cacheControl,
				ASSET_MANIFEST,
				ASSET_NAMESPACE,
			})
		} catch (error) {
			if (
				error instanceof MethodNotAllowedError ||
				error instanceof NotFoundError
			) {
				return null
			}

			throw error
		}
	}

const kvAssetHandler = createKvAssetHandler(JSON.parse(manifestJSON))

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const { pathname } = new URL(request.url)
		if (pathname.startsWith('/.well-known/')) {
			return new Response('Not Found', {
				status: 404,
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Cache-Control': 'no-store',
				},
			})
		}

		const assetResponse = await kvAssetHandler(request, env, ctx, build)
		if (assetResponse) return assetResponse
		return remixHandler(request, { env, mode })
	},
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	) {
		ctx.waitUntil(
			cleanupExpiredMeetings(env)
				.then((deletedMeetings) => {
					console.log('Scheduled meeting cleanup completed', {
						cron: controller.cron,
						deletedMeetings,
					})
				})
				.catch((error) => {
					console.error('Scheduled meeting cleanup failed', {
						cron: controller.cron,
						error,
					})
				})
		)
	},
	queue,
}
