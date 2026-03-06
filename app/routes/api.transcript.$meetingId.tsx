import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare'
import { eq } from 'drizzle-orm'
import { getDb, Transcripts } from 'schema'

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
	const { meetingId } = params
	if (!meetingId) {
		return new Response('Meeting ID is required', { status: 400 })
	}

	const db = getDb(context)
	if (!db) {
		return new Response('Database not found', { status: 404 })
	}

	const transcripts = await db
		.select()
		.from(Transcripts)
		.where(eq(Transcripts.meetingId, meetingId))
		.orderBy(Transcripts.created)

	// Format as a text file
	const formatted = transcripts
		.map((t) => `[${t.created}] ${t.userName}: ${t.text}`)
		.join('\n')

	return new Response(formatted, {
		headers: {
			'Content-Type': 'text/plain',
			'Content-Disposition': `attachment; filename="transcript-${meetingId}.txt"`,
		},
	})
}
