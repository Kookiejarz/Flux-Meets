// React 19 server-side rendering requires MessageChannel, which is not
// globally available in the Cloudflare Workers runtime by default.
import { MessageChannel } from 'node:worker_threads'

if (typeof globalThis.MessageChannel === 'undefined') {
	;(globalThis as any).MessageChannel = MessageChannel
}
