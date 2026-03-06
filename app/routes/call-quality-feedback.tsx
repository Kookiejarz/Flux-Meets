import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/cloudflare'
import { Form, Link, useLoaderData, useSearchParams } from '@remix-run/react'
import { eq } from 'drizzle-orm'
import {
	AnalyticsSimpleCallFeedback,
	getDb,
	Meetings,
	Transcripts,
} from 'schema'
import invariant from 'tiny-invariant'
import { Icon } from '~/components/Icon/Icon'
import { RELEASE } from '~/utils/constants'

const redirectToHome = new Response(null, {
	status: 302,
	headers: {
		Location: '/',
	},
})

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	try {
		const url = new URL(request.url)
		const meetingId = url.searchParams.get('meetingId')

		if (!meetingId) {
			return json({ meeting: null, participants: [], error: null })
		}

		const db = getDb(context)
		if (!db) {
			console.warn('Database binding missing')
			return json({
				meeting: null,
				participants: [],
				error: null, // 允许继续反馈
			})
		}

		try {
			const [meeting] = await db
				.select()
				.from(Meetings)
				.where(eq(Meetings.id, meetingId))

			const participants = meeting
				? await db
						.select({
							userName: Transcripts.userName,
							userId: Transcripts.userId,
						})
						.from(Transcripts)
						.where(eq(Transcripts.meetingId, meetingId))
						.groupBy(Transcripts.userId, Transcripts.userName)
				: []

			return json({ meeting, participants, error: null })
		} catch (dbError: any) {
			console.error('Database query failed:', dbError)
			// 数据库错误时返回空数据但不阻止反馈流程
			return json({
				meeting: null,
				participants: [],
				error: null,
			})
		}
	} catch (e: any) {
		console.error('Unexpected error:', e)
		return json({
			meeting: null,
			participants: [],
			error: null,
		})
	}
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
	const db = getDb(context)
	if (!db) return redirectToHome

	const formData = await request.formData()
	const experiencedIssues = formData.get('experiencedIssues') === 'true'
	const meetingId = formData.get('meetingId')
	invariant(typeof meetingId === 'string')

	await db
		.insert(AnalyticsSimpleCallFeedback)
		.values({
			experiencedIssues: Number(experiencedIssues),
			version: RELEASE ?? 'dev',
			meetingId,
		})
		.run()

	return redirectToHome
}

function formatDuration(startStr: string, endStr: string | null) {
	const normalizeDate = (s: string) =>
		s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z'
	const start = new Date(normalizeDate(startStr)).getTime()
	const end = endStr ? new Date(normalizeDate(endStr)).getTime() : Date.now()
	const diff = Math.max(0, Math.floor((end - start) / 1000))

	const hours = Math.floor(diff / 3600)
	const minutes = Math.floor((diff % 3600) / 60)
	const seconds = diff % 60

	const parts = []
	if (hours > 0) parts.push(`${hours}h`)
	if (minutes > 0) parts.push(`${minutes}m`)
	if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)

	return parts.join(' ')
}

export default function MeetingSummary() {
	const { meeting, participants } = useLoaderData<typeof loader>()
	const [params] = useSearchParams()
	const meetingId = params.get('meetingId')

	// 只在没有 meetingId 时显示错误（数据库查询失败优雅降级）
	if (!meetingId) {
		return (
			<div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center p-6">
				<div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-xs w-full text-center">
					<Icon
						type="ExclamationCircleIcon"
						className="w-10 h-10 text-red-500 mx-auto mb-3"
					/>
					<h1 className="text-lg font-bold text-zinc-100 mb-1">
						Summary Unavailable
					</h1>
					<p className="text-zinc-500 text-xs mb-5">
						Meeting not found
					</p>
					<Link
						to="/"
						className="inline-block w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold py-2.5 rounded-xl transition-all"
					>
						Return Home
					</Link>
				</div>
			</div>
		)
	}

	return (
		<div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 selection:bg-orange-500/30 font-sans">
			{/* Ambient Background Glow - Subtle */}
			<div className="fixed inset-0 overflow-hidden pointer-events-none">
				<div className="absolute top-[5%] left-[10%] w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-full" />
			</div>

			<div className="relative max-w-xl mx-auto px-6 py-12 md:py-16">
				<div className="text-center mb-10">
					<div className="inline-flex p-2.5 bg-orange-500/10 rounded-xl mb-4 ring-1 ring-orange-500/20">
						<Icon type="CheckIcon" className="w-6 h-6 text-orange-500" />
					</div>
					<h1 className="text-3xl font-black tracking-tight mb-2">
						Meeting Over
					</h1>
					<p className="text-zinc-500 text-sm font-medium">
						Session details and assets
					</p>
				</div>

				{/* Compact Stats Row */}
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
					<div className="bg-zinc-900/50 backdrop-blur-md border border-white/5 p-4 rounded-2xl">
						<p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">
							Room
						</p>
						<p className="text-sm font-bold truncate">
							{meeting?.roomName || 'Private'}
						</p>
					</div>
					<div className="bg-zinc-900/50 backdrop-blur-md border border-white/5 p-4 rounded-2xl">
						<p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">
							Duration
						</p>
						<p className="text-sm font-bold">
							{meeting?.created && meeting?.ended
								? formatDuration(meeting.created, meeting.ended)
								: '--'}
						</p>
					</div>
					<div className="col-span-2 sm:col-span-1 bg-zinc-900/50 backdrop-blur-md border border-white/5 p-4 rounded-2xl text-center sm:text-left">
						<p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">
							Users
						</p>
						<p className="text-sm font-bold">{meeting?.peakUserCount ?? '--'}</p>
					</div>
				</div>

				<div className="space-y-4">
					{/* Participants Section - More compact */}
					{participants.length > 0 && (
						<div className="bg-zinc-900/30 border border-white/5 p-5 rounded-2xl">
							<h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">
								Participants
							</h2>
							<div className="flex flex-wrap gap-1.5">
								{participants
									.filter((p) => p !== null)
									.map((p, i) => (
										<div
											key={p.userId || i}
											className="bg-white/5 px-3 py-1 rounded-lg text-xs font-medium border border-white/5 hover:bg-white/10 transition-colors"
										>
											{p.userName}
										</div>
									))}
							</div>
						</div>
					)}

					{/* Download Card - Resized and more elegant */}
					<div className="group relative bg-orange-500 rounded-2xl p-6 overflow-hidden transition-all active:scale-[0.99] border border-orange-400/20 shadow-lg shadow-orange-500/10">
						<div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-orange-600" />
						<div className="absolute -top-4 -right-4 p-4 opacity-10 group-hover:scale-110 transition-transform">
							<Icon
								type="ArrowDownOnSquareIcon"
								className="w-20 h-24 text-white"
							/>
						</div>
						<div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
							<div className="max-w-[240px]">
								<h2 className="text-lg font-black text-white mb-1 uppercase tracking-tight">
									Full Transcript
								</h2>
								<p className="text-orange-100 text-[11px] font-medium leading-tight">
									Complete record of the meeting conversation is ready for
									download.
								</p>
							</div>
							<button
								onClick={() =>
									window.open(`/api/transcript/${meetingId}`, '_blank')
								}
								className="bg-white text-orange-600 px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider hover:bg-zinc-50 transition-colors shadow-lg self-start sm:self-center"
							>
								Download TXT
							</button>
						</div>
					</div>

					{/* Feedback Box - More compact */}
					<div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 p-6 rounded-2xl">
						<h2 className="text-sm font-bold mb-4">How was the call?</h2>
						<Form className="flex gap-3" method="post">
							<button
								className="flex-1 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-100 py-3 rounded-xl text-xs font-bold transition-all border border-white/5 shadow-sm"
								value="false"
								name="experiencedIssues"
								type="submit"
							>
								Great
							</button>
							<button
								className="flex-1 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-500 py-3 rounded-xl text-xs font-bold transition-all border border-red-500/20 shadow-sm"
								value="true"
								name="experiencedIssues"
								type="submit"
							>
								Issues
							</button>
							<input type="hidden" name="meetingId" value={meetingId} />
						</Form>
					</div>
				</div>

				<div className="text-center mt-10">
					<Link
						to="/"
						className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-100 transition-colors text-xs font-medium group"
					>
						<Icon
							type="xMark"
							className="w-3 h-3 transition-transform group-hover:rotate-90"
						/>
						<span>Back to Dashboard</span>
					</Link>
				</div>
			</div>
		</div>
	)
}
