import { json } from 'react-router'

export const loader = async () => {
	return json({
		name: 'Orange Meets',
		short_name: 'Orange Meets',
		icons: [
			{
				src: '/clapper-48.ico',
				sizes: '48x48',
				type: 'image/x-icon',
			},
			{
				src: '/clapper-128.ico',
				sizes: '64x64',
				type: 'image/x-icon',
			},
			{
				src: '/clapper-256.ico',
				sizes: '256x256',
				type: 'image/x-icon',
			},
		],
		theme_color: '#ffffff',
		background_color: '#ffffff',
		display: 'standalone',
	})
}
