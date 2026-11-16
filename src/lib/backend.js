/**
 * Backend switch: 'folder' (local Box Drive folder, default) or 'box' (Box OAuth).
 *
 * Priority:
 *   1. localStorage 'ibmtodo_backend'  (per browser, for quick tests:
 *      localStorage.setItem('ibmtodo_backend', 'box'); then reload)
 *   2. build-time env VITE_STORAGE_BACKEND  (set via GitHub variable STORAGE_BACKEND)
 *   3. 'folder'
 */

import { browser } from '$app/environment';

/** @param {string | null | undefined} v */
const valid = (v) => (v === 'box' || v === 'folder' ? v : null);

export const BACKEND = /** @type {'box' | 'folder'} */ (
	(browser && valid(localStorage.getItem('ibmtodo_backend'))) ||
		valid(import.meta.env.VITE_STORAGE_BACKEND) ||
		'folder'
);
