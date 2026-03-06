/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
	devServerBroadcastDelay: 1000,
	ignoredRouteFiles: ['**/.*'],
	server: './server.ts',
	serverConditions: ['worker'],
	serverBuildPath: 'build/index.mjs',
	serverDependenciesToBundle: [
		'@mediapipe/selfie_segmentation',
		/^(?!__STATIC_CONTENT_MANIFEST|cloudflare:workers|partyserver).*$/,
	],
	serverMainFields: ['workerd', 'browser', 'module', 'main'],
	serverMinify: true,
	serverModuleFormat: 'esm',
	serverPlatform: 'neutral',
	tailwind: true,
	postcss: true,
	future: {
		v3_fetcherPersist: true,
		v3_lazyRouteDiscovery: false,
		v3_relativeSplatPath: true,
		v3_singleFetch: false,
		v3_throwAbortReason: true,
	},
	// appDirectory: "app",
	// assetsBuildDirectory: "public/build",
	// serverBuildPath: "build/index.js",
	// publicPath: "/build/",
}
