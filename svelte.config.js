import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			// GitHub Pages erwartet alle Dateien im Root oder in einem Unterordner
			pages: 'build',
			assets: 'build',
			fallback: 'index.html', // SPA-Modus: alle Routen auf index.html
			precompress: false,
			strict: false
		}),
		// Wenn die App unter einem Unterverzeichnis liegt (z.B. /ToDoList/)
		// wird der base-Pfad aus der Umgebungsvariable gelesen (gesetzt im GitHub Action)
		paths: {
			base: process.env.BASE_PATH ?? ''
		}
	}
};

export default config;
