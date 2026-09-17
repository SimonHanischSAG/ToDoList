/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				ibm: {
					blue: '#0f62fe',
					'blue-dark': '#0043ce',
					gray: '#f4f4f4',
					'gray-dark': '#e0e0e0',
					text: '#161616',
					'text-muted': '#525252'
				}
			}
		}
	},
	plugins: []
};
