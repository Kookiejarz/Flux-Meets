import {
	data,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/cloudflare'
import { Link, useLoaderData, useSearchParams } from '@remix-run/react'
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

type SummaryParticipant = {
	userId: string
	userName: string
}

type SummaryLoaderData = {
	meeting: {
		roomName: string | null
		created: string | null
		ended: string | null
		peakUserCount: number | null
	} | null
	participants: SummaryParticipant[]
	error: null
}

function normalizeTimestamp(input: string | null): string | null {
	if (!input) return null
	const numeric = Number(input)
	if (Number.isFinite(numeric) && numeric > 0) {
		return new Date(numeric).toISOString()
	}
	const parsed = new Date(input)
	if (!Number.isNaN(parsed.getTime())) {
		return parsed.toISOString()
	}
	return null
}

function parseMeetingSnapshot(url: URL): SummaryLoaderData['meeting'] {
	const created = normalizeTimestamp(url.searchParams.get('startedAt'))
	const ended = normalizeTimestamp(url.searchParams.get('endedAt'))
	const roomName = url.searchParams.get('roomName')?.trim() || null
	const peakUserCountRaw = url.searchParams.get('userCount')
	const parsedUserCount =
		peakUserCountRaw === null ? NaN : Number.parseInt(peakUserCountRaw, 10)
	const peakUserCount =
		Number.isFinite(parsedUserCount) && parsedUserCount >= 0
			? parsedUserCount
			: null

	if (!created && !roomName && peakUserCount === null) return null

	return {
		roomName,
		created,
		ended,
		peakUserCount,
	}
}

function mergeMeeting(
	dbMeeting: SummaryLoaderData['meeting'],
	snapshotMeeting: SummaryLoaderData['meeting']
): SummaryLoaderData['meeting'] {
	if (!dbMeeting) return snapshotMeeting
	if (!snapshotMeeting) return dbMeeting
	return {
		roomName: dbMeeting.roomName ?? snapshotMeeting.roomName,
		created: dbMeeting.created ?? snapshotMeeting.created,
		ended: dbMeeting.ended ?? snapshotMeeting.ended,
		peakUserCount: dbMeeting.peakUserCount ?? snapshotMeeting.peakUserCount,
	}
}

function normalizeParticipants(input: unknown): SummaryParticipant[] {
	if (!Array.isArray(input)) return []
	return input
		.map((item) => {
			if (!item || typeof item !== 'object') return null
			const userId =
				typeof (item as any).userId === 'string'
					? (item as any).userId.trim()
					: ''
			const userName =
				typeof (item as any).userName === 'string'
					? (item as any).userName.trim()
					: ''
			if (!userId || !userName) return null
			return { userId, userName }
		})
		.filter((item): item is SummaryParticipant => item !== null)
}

function parseParticipantSnapshot(
	encoded: string | null
): SummaryParticipant[] {
	if (!encoded) return []
	try {
		const parsed = JSON.parse(encoded)
		return normalizeParticipants(parsed)
	} catch {
		return []
	}
}

function mergeParticipants(
	dbParticipants: SummaryParticipant[],
	snapshotParticipants: SummaryParticipant[]
) {
	const map = new Map<string, SummaryParticipant>()
	for (const participant of [
		...normalizeParticipants(snapshotParticipants),
		...normalizeParticipants(dbParticipants),
	]) {
		const key = participant.userId || participant.userName.toLowerCase()
		if (!map.has(key)) map.set(key, participant)
	}
	return Array.from(map.values())
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	let snapshotParticipants: SummaryParticipant[] = []
	let snapshotMeeting: SummaryLoaderData['meeting'] = null
	try {
		const url = new URL(request.url)
		const meetingId = url.searchParams.get('meetingId')
		snapshotParticipants = parseParticipantSnapshot(
			url.searchParams.get('participants')
		)
		snapshotMeeting = parseMeetingSnapshot(url)

		if (!meetingId) {
			return data({
				meeting: snapshotMeeting,
				participants: snapshotParticipants,
				error: null,
			})
		}

		const db = getDb(context)
		if (!db) {
			console.warn('Database binding missing')
			return data({
				meeting: snapshotMeeting,
				participants: snapshotParticipants,
				error: null, // 允许继续反馈
			})
		}

		try {
			const [meeting] = await db
				.select()
				.from(Meetings)
				.where(eq(Meetings.id, meetingId))

			const dbParticipantsRaw: SummaryParticipant[] = meeting
				? await db
						.select({
							userName: Transcripts.userName,
							userId: Transcripts.userId,
						})
						.from(Transcripts)
						.where(eq(Transcripts.meetingId, meetingId))
						.groupBy(Transcripts.userId, Transcripts.userName)
				: []
			const dbParticipants = normalizeParticipants(dbParticipantsRaw)
			const participants = mergeParticipants(
				dbParticipants,
				snapshotParticipants
			)

			return data({
				meeting: mergeMeeting(meeting ?? null, snapshotMeeting),
				participants,
				error: null,
			})
		} catch (dbError: any) {
			console.error('Database query failed:', dbError)
			// 数据库错误时返回空数据但不阻止反馈流程
			return data({
				meeting: snapshotMeeting,
				participants: snapshotParticipants,
				error: null,
			})
		}
	} catch (e: any) {
		console.error('Unexpected error:', e)
		return data({
			meeting: snapshotMeeting,
			participants: snapshotParticipants,
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
	const loaderData = useLoaderData<SummaryLoaderData>()
	const meeting = loaderData?.meeting ?? null
	const participants = normalizeParticipants(loaderData?.participants)
	const [params] = useSearchParams()
	const meetingId = params.get('meetingId')

	return (
		<div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 selection:bg-orange-500/30 font-sans">
			{/* Ambient Background Glow - Subtle */}
			<div className="fixed inset-0 overflow-hidden pointer-events-none">
				<div className="absolute top-[5%] left-[10%] w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-full" />
			</div>

			<div className="relative max-w-xl mx-auto px-5 py-8">
				<div className="text-center mb-6">
					<div className="inline-flex p-2 bg-orange-500/10 rounded-xl mb-3 ring-1 ring-orange-500/20">
						<Icon type="CheckIcon" className="w-5 h-5 text-orange-500" />
					</div>
					<h1 className="text-2xl font-black tracking-tight mb-1.5">
						Meeting Over
					</h1>
					{meetingId && (
						<p className="text-[10px] font-mono text-zinc-600 mb-1.5">
							ID: {meetingId}
						</p>
					)}
					<p className="text-zinc-500 text-xs font-medium">
						Session details and assets
					</p>
				</div>

				{/* Compact Stats Row */}
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
					<div className="bg-zinc-900/50 backdrop-blur-md border border-white/5 p-3 rounded-xl">
						<p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">
							Room
						</p>
						<p className="text-xs font-bold truncate">
							{meeting?.roomName || 'Private'}
						</p>
					</div>
					<div className="bg-zinc-900/50 backdrop-blur-md border border-white/5 p-3 rounded-xl">
						<p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">
							Duration
						</p>
						<p className="text-xs font-bold">
							{meeting?.created
								? formatDuration(meeting.created, meeting.ended)
								: '--'}
						</p>
					</div>
					<div className="col-span-2 sm:col-span-1 bg-zinc-900/50 backdrop-blur-md border border-white/5 p-3 rounded-xl text-center sm:text-left">
						<p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">
							Users
						</p>
						<p className="text-xs font-bold">
							{meeting?.peakUserCount ??
								(participants.length > 0 ? participants.length : '--')}
						</p>
					</div>
				</div>

				<div className="space-y-3">
					{/* Participants Section - More compact */}
					{participants.length > 0 && (
						<div className="bg-zinc-900/30 border border-white/5 p-4 rounded-xl">
							<h2 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
								Participants
							</h2>
							<div className="flex flex-wrap gap-1.5">
								{participants
									.filter(
										(p: SummaryParticipant | null): p is SummaryParticipant =>
											p !== null
									)
									.map((p: SummaryParticipant, i: number) => (
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

					{meetingId ? (
						<div className="group relative bg-orange-500 rounded-xl p-4 overflow-hidden transition-all active:scale-[0.99] border border-orange-400/20 shadow-lg shadow-orange-500/10">
							<div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-orange-600" />
							<div className="absolute -top-2 -right-2 p-2 opacity-10 group-hover:scale-110 transition-transform">
								<Icon
									type="ArrowDownOnSquareIcon"
									className="w-12 h-12 text-white"
								/>
							</div>
							<div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
								<div className="max-w-[240px]">
									<h2 className="text-base font-black text-white mb-0.5 uppercase tracking-tight">
										Full Transcript
									</h2>
									<p className="text-orange-100 text-[10px] font-medium leading-tight">
										Complete record of the meeting conversation is ready for
										download.
									</p>
								</div>
								<button
									onClick={() =>
										window.open(`/api/transcript/${meetingId}`, '_blank')
									}
									className="bg-white text-orange-600 px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider hover:bg-zinc-50 transition-colors shadow-lg self-start sm:self-center"
								>
									Download TXT
								</button>
							</div>
						</div>
					) : (
						<div className="bg-zinc-900/30 border border-white/5 p-4 rounded-xl">
							<h2 className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
								Summary Snapshot
							</h2>
							<p className="text-xs text-zinc-300 leading-relaxed">
								This summary is based on client-side room data captured when you
								left. A transcript download is unavailable because the meeting ID
								was not present.
							</p>
						</div>
					)}
				</div>

				<div className="text-center mt-6">
					<Link
						to="/"
						className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-100 transition-colors text-[11px] font-medium group"
					>
						<Icon
							type="xMark"
							className="w-2.5 h-2.5 transition-transform group-hover:rotate-90"
						/>
						<span>Back to Dashboard</span>
					</Link>
				</div>
			</div>
		</div>
	)
}
