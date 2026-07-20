/**
 * Box OAuth 2.0 authentication (PKCE flow)
 *
 * Each user logs in with their own IBM Box account.
 * Data is stored in their personal Box folder.
 *
 * PKCE flow: no client secret needed – secure for SPAs.
 */

import { browser } from '$app/environment';

// ── Configuration ──────────────────────────────────────────────────────────
const CLIENT_ID     = import.meta.env.VITE_BOX_CLIENT_ID     ?? '57mjnjrkdl2787qrsbcmk3zczhwa2en6';
const CLIENT_SECRET = import.meta.env.VITE_BOX_CLIENT_SECRET ?? '';
const REDIRECT_URI = browser
	? window.location.origin + window.location.pathname.replace(/\/$/, '') + '/'
	: 'https://simonhanischsag.github.io/ToDoList/';

const BOX_AUTH_URL = 'https://account.box.com/api/oauth2/authorize';
const BOX_TOKEN_URL = 'https://api.box.com/oauth2/token';

const STORAGE_KEY_TOKEN   = 'box_access_token';
const STORAGE_KEY_REFRESH = 'box_refresh_token';
const STORAGE_KEY_VERIFIER = 'box_pkce_verifier';
const STORAGE_KEY_USER    = 'box_user';
const STORAGE_KEY_EXPIRY  = 'box_token_expiry'; // Unix timestamp (ms) of token expiry

// How many milliseconds before expiry the token is proactively refreshed
const REFRESH_AHEAD_MS = 5 * 60 * 1000; // 5 minutes

// Running refresh promise (prevents parallel refresh requests)
let _refreshPromise = /** @type {Promise<boolean> | null} */ (null);

// Proactive refresh timer
let _refreshTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

// ── PKCE Helpers ───────────────────────────────────────────────────────────

/** Generates a random code verifier (43–128 characters) */
function generateVerifier() {
	const array = new Uint8Array(64);
	crypto.getRandomValues(array);
	return base64url(array);
}

/** Calculates the SHA-256 code challenge from the verifier */
async function generateChallenge(verifier) {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return base64url(new Uint8Array(digest));
}

/** URL-safe Base64 encoding without padding */
function base64url(buffer) {
	return btoa(String.fromCharCode(...buffer))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Starts the Box login redirect (PKCE).
 * Saves the verifier in sessionStorage for the token exchange after the redirect.
 */
export async function login() {
	const verifier  = generateVerifier();
	const challenge = await generateChallenge(verifier);

	sessionStorage.setItem(STORAGE_KEY_VERIFIER, verifier);

	const params = new URLSearchParams({
		client_id:             CLIENT_ID,
		redirect_uri:          REDIRECT_URI,
		response_type:         'code',
		code_challenge:        challenge,
		code_challenge_method: 'S256',
		state:                 crypto.randomUUID()
	});

	window.location.href = `${BOX_AUTH_URL}?${params}`;
}

/**
 * Processes the redirect after Box login.
 * Exchanges the authorization code for an access token.
 * Called on app start.
 * @returns {Promise<boolean>} true if login was successful
 */
export async function handleRedirect() {
	if (!browser) return false;

	const params   = new URLSearchParams(window.location.search);
	const code     = params.get('code');
	const verifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);

	if (!code || !verifier) return false;

	// Clean up URL (remove code from address bar)
	window.history.replaceState({}, '', window.location.pathname);
	sessionStorage.removeItem(STORAGE_KEY_VERIFIER);

	const body = new URLSearchParams({
		grant_type:     'authorization_code',
		client_id:      CLIENT_ID,
		client_secret:  CLIENT_SECRET,
		code,
		code_verifier:  verifier,
		redirect_uri:   REDIRECT_URI
	});

	const res = await fetch(BOX_TOKEN_URL, {
		method:  'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});

	if (!res.ok) {
		console.error('[Box Auth] Token exchange failed:', await res.text());
		return false;
	}

	const data = await res.json();
	saveTokens(data);

	// Clear local task cache – Box is the leading source
	localStorage.removeItem('ibmtodo_local');

	return true;
}

/**
 * Returns the stored access token.
 * @returns {string | null}
 */
export function getToken() {
	if (!browser) return null;
	return localStorage.getItem(STORAGE_KEY_TOKEN);
}

/**
 * Starts a proactive refresh timer that renews the token shortly before it expires.
 * Called after every successful token acquisition.
 */
export function startTokenRefreshTimer() {
	if (!browser) return;
	if (_refreshTimer) clearTimeout(_refreshTimer);

	const expiry = parseInt(localStorage.getItem(STORAGE_KEY_EXPIRY) ?? '0', 10);
	if (!expiry) return;

	const msUntilRefresh = expiry - Date.now() - REFRESH_AHEAD_MS;
	if (msUntilRefresh <= 0) {
		// Token already expired or about to expire → refresh immediately
		refreshToken();
		return;
	}

	_refreshTimer = setTimeout(async () => {
		_refreshTimer = null;
		console.info('[Box Auth] Proactive token refresh…');
		const ok = await refreshToken();
		if (ok) {
			startTokenRefreshTimer(); // set new timer for the fresh token
		} else {
			console.warn('[Box Auth] Proactive refresh failed – user must sign in again.');
		}
	}, msUntilRefresh);
}

/**
 * Stops the proactive refresh timer (e.g. on logout).
 */
export function stopTokenRefreshTimer() {
	if (_refreshTimer) {
		clearTimeout(_refreshTimer);
		_refreshTimer = null;
	}
}

/**
 * Silently renews the access token in the background via refresh token.
 * @returns {Promise<boolean>} true if successful
 */
export async function refreshToken() {
	if (!browser) return false;

	// Prevent parallel refresh requests
	if (_refreshPromise) return _refreshPromise;

	const refresh = localStorage.getItem(STORAGE_KEY_REFRESH);
	if (!refresh) return false;

	_refreshPromise = (async () => {
		try {
			const body = new URLSearchParams({
				grant_type:    'refresh_token',
				client_id:     CLIENT_ID,
				client_secret: CLIENT_SECRET,
				refresh_token: refresh
			});
			const res = await fetch(BOX_TOKEN_URL, {
				method:  'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body
			});
			if (!res.ok) return false;
			const data = await res.json();
			saveTokens(data);
			return true;
		} catch {
			return false;
		} finally {
			_refreshPromise = null;
		}
	})();

	return _refreshPromise;
}

/**
 * Returns the currently logged-in user, or null.
 * @returns {{ name: string, login: string } | null}
 */
export function getUser() {
	if (!browser) return null;
	const raw = localStorage.getItem(STORAGE_KEY_USER);
	return raw ? JSON.parse(raw) : null;
}

/**
 * Logs the user out (clears local state).
 */
export function logout() {
	stopTokenRefreshTimer();
	localStorage.removeItem(STORAGE_KEY_TOKEN);
	localStorage.removeItem(STORAGE_KEY_REFRESH);
	localStorage.removeItem(STORAGE_KEY_EXPIRY);
	localStorage.removeItem(STORAGE_KEY_USER);
	// Box has no server-side logout URL for SPAs
	window.location.reload();
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Saves access + refresh token from a token response.
 * Also calculates and stores the access token expiry timestamp.
 * @param {Record<string, string>} data
 */
function saveTokens(data) {
	if (data.access_token)  localStorage.setItem(STORAGE_KEY_TOKEN,   data.access_token);
	if (data.refresh_token) localStorage.setItem(STORAGE_KEY_REFRESH, data.refresh_token);

	// Box returns expires_in in seconds (default: 3600 = 1h)
	const expiresIn = parseInt(String(data.expires_in ?? '3600'), 10);
	const expiry = Date.now() + expiresIn * 1000;
	localStorage.setItem(STORAGE_KEY_EXPIRY, String(expiry));

	const userName = data.token_extra_info?.name ?? null;
	if (userName) localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({ name: userName, login: '' }));
}
