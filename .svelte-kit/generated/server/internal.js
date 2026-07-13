
import root from '../root.js';
import { set_building, set_prerendering } from '$app/env/internal';
import { set_assets } from '$app/paths/internal/server';
import { set_manifest, set_read_implementation } from '__sveltekit/server';
import { set_private_env, set_public_env } from '../../../node_modules/@sveltejs/kit/src/runtime/shared-server.js';
import error from '../shared/error-template.js';

export const options = {
	app_template_contains_nonce: false,
	async: false,
	csp: {"mode":"auto","directives":{"upgrade-insecure-requests":false,"block-all-mixed-content":false},"reportOnly":{"upgrade-insecure-requests":false,"block-all-mixed-content":false}},
	csrf_check_origin: true,
	csrf_trusted_origins: [],
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hash_routing: false,
	hooks: null, // added lazily, via `get_hooks`
	preload_strategy: "modulepreload",
	root,
	service_worker: false,
	service_worker_options: undefined,
	server_error_boundaries: false,
	templates: {
		app: ({ head, body, assets, nonce, env }) => "<!DOCTYPE html>\n<html lang=\"de\">\n<head>\n\t<meta charset=\"utf-8\" />\n\t<link rel=\"icon\" href=\"" + assets + "/favicon.svg\" />\n\t<!-- Wichtig für PWA auf iOS: Viewport verhindert Zoom -->\n\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\" />\n\t<meta name=\"apple-mobile-web-app-capable\" content=\"yes\" />\n\t<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\" />\n\t<meta name=\"apple-mobile-web-app-title\" content=\"IBM Todo\" />\n\t<link rel=\"apple-touch-icon\" href=\"" + assets + "/apple-touch-icon.png\" />\n\t" + head + "\n</head>\n<body data-sveltekit-preload-data=\"hover\">\n\t<div style=\"display: contents\">" + body + "</div>\n</body>\n</html>\n",
		error
	},
	version_hash: "4igaex"
};

export async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let handleValidationError;
	let init;
	

	let reroute;
	let transport;
	

	return {
		handle,
		handleFetch,
		handleError,
		handleValidationError,
		init,
		reroute,
		transport
	};
}

export { set_assets, set_building, set_manifest, set_prerendering, set_private_env, set_public_env, set_read_implementation };
