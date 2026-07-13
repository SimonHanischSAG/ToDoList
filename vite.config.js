import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
			manifest: {
				name: 'IBM Todo App',
				short_name: 'IBM Todo',
				description: 'Intelligente Todo-Verwaltung für IBM-Mitarbeiter',
				theme_color: '#1f2328',
				background_color: '#ffffff',
				display: 'standalone',
				orientation: 'portrait',
				scope: '/',
				start_url: '/',
				icons: [
					{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				// App-Shell und Assets cachen
				globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
				// Navigations-Requests immer auf index.html leiten (SPA)
				navigateFallback: 'index.html',
				// API-Calls (Graph, MSAL) nicht cachen
				navigateFallbackDenylist: [/^\/api/]
			}
		})
	]
});
