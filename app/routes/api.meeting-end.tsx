import { json, type ActionFunctionArgs } from '@remix-run/cloudflare'
import { eq, sql } from 'drizzle-orm'
import { getDb, Meetings } from 'schema'

export const action = async ({ request, context }: ActionFunctionArgs) => {
	const db = getDb(context)
	if (!db) return json({ ok: false, error: 'db-missing' }, { status: 500 })
	const formData = await request.formData()
	const meetingId = formData.get('meetingId')
	if (typeof meetingId !== 'string' || !meetingId) {
		return json({ ok: false, error: 'missing-meetingId' }, { status: 400 })
	}

	try {
		await db
			.update(Meetings)
			.set({ ended: sql`CURRENT_TIMESTAMP` })
			.where(eq(Meetings.id, meetingId))
			.run()
		return json({ ok: true })
	} catch (err) {
		console.error('mark meeting ended failed', err)
		return json({ ok: false, error: 'db-error' }, { status: 500 })
	}
}

export const loader = () => json({ ok: true })
