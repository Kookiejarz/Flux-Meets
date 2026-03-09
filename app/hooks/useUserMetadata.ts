import { useOutletContext } from '@remix-run/react'
import { useQuery } from 'react-query'

interface UserMetadata {
	displayName: string
	firstName?: string
	lastName?: string
	timeZone?: string
	photob64?: string
}

export function useUserMetadata(email: string) {
	const { userDirectoryUrl } = useOutletContext<{ userDirectoryUrl?: string }>()
	const normalizedDirectoryUrl = userDirectoryUrl?.trim()
	const normalizedEmail = email?.trim()
	const shouldQueryDirectory =
		Boolean(normalizedDirectoryUrl) &&
		typeof normalizedEmail === 'string' &&
		normalizedEmail.includes('@')

	const initialData: UserMetadata = {
		displayName: normalizedEmail || email,
	}

	return useQuery({
		initialData,
		queryKey: ['user-metadata', normalizedDirectoryUrl, normalizedEmail],
		queryFn: async ({ queryKey: [, directoryUrl, currentEmail] }) => {
			if (
				!shouldQueryDirectory ||
				!directoryUrl ||
				typeof directoryUrl !== 'string'
			) {
				return initialData
			}

			const search = new URLSearchParams({ email: String(currentEmail) })
			const response = await fetch(`${directoryUrl}?${search}`, {
				credentials: 'include',
			})

			if (
				response.headers.get('Content-Type')?.startsWith('application/json')
			) {
				const parsedData: UserMetadata = (await response.json()) as any
				const combinedName = [parsedData.firstName, parsedData.lastName]
					.filter(Boolean)
					.join(' ')
					.trim()
				const displayName =
					parsedData.displayName?.trim() ||
					combinedName ||
					initialData.displayName

				return {
					...parsedData,
					displayName,
				}
			}
			return initialData
		},
	})
}
