/**
 * Box OAuth 2.0 Authentifizierung (PKCE-Flow)
 *
 * Jeder Nutzer loggt sich mit seinem eigenen IBM Box-Account ein.
 * Daten werden in seinem persönlichen Box-Ordner gespeichert.
 *
 * PKCE-Flow: kein Client Secret nötig – sicher für SPAs.
 */

import { browser } from '$app/environment';

// ── Konfiguration ──────────────────────────────────────────────────────────
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
const STORAGE_KEY_EXPIRY  = 'box_token_expiry'; // Unix-Timestamp (ms) des Token-Ablaufs

// Wieviele Millisekunden vor Ablauf der Token proaktiv erneuert wird
const REFRESH_AHEAD_MS = 5 * 60 * 1000; // 5 Minuten

// Laufender Refresh-Promise (verhindert parallele Refresh-Requests)
let _refreshPromise = /** @type {Promise<boolean> | null} */ (null);

// Proaktiver Refresh-Timer
let _refreshTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

// ── PKCE Helpers ───────────────────────────────────────────────────────────

/** Generiert einen zufälligen Code Verifier (43–128 Zeichen) */
function generateVerifier() {
	const array = new Uint8Array(64);
	crypto.getRandomValues(array);
	return base64url(array);
}

/** Berechnet den SHA-256 Code Challenge aus dem Verifier */
async function generateChallenge(verifier) {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return base64url(new Uint8Array(digest));
}

/** URL-sichere Base64-Kodierung ohne Padding */
function base64url(buffer) {
	return btoa(String.fromCharCode(...buffer))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

// ── Öffentliche API ────────────────────────────────────────────────────────

/**
 * Startet den Box Login-Redirect (PKCE).
 * Speichert den Verifier in sessionStorage für den Token-Tausch nach dem Redirect.
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
 * Verarbeitet den Redirect nach dem Box-Login.
 * Tauscht den Authorization Code gegen ein Access Token.
 * Wird beim App-Start aufgerufen.
 * @returns {Promise<boolean>} true wenn Login erfolgreich
 */
export async function handleRedirect() {
	if (!browser) return false;

	const params   = new URLSearchParams(window.location.search);
	const code     = params.get('code');
	const verifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);

	if (!code || !verifier) return false;

	// URL bereinigen (code aus der Adressleiste entfernen)
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
		console.error('[Box Auth] Token-Tausch fehlgeschlagen:', await res.text());
		return false;
	}

	const data = await res.json();
	saveTokens(data);

	// Lokalen Task-Cache leeren – Box ist die führende Quelle
	localStorage.removeItem('ibmtodo_local');

	return true;
}

/**
 * Gibt das gespeicherte Access Token zurück.
 * @returns {string | null}
 */
export function getToken() {
	if (!browser) return null;
	return localStorage.getItem(STORAGE_KEY_TOKEN);
}

/**
 * Startet einen proaktiven Refresh-Timer, der das Token kurz vor Ablauf erneuert.
 * Wird nach jedem erfolgreichen Token-Erhalt aufgerufen.
 */
export function startTokenRefreshTimer() {
	if (!browser) return;
	if (_refreshTimer) clearTimeout(_refreshTimer);

	const expiry = parseInt(localStorage.getItem(STORAGE_KEY_EXPIRY) ?? '0', 10);
	if (!expiry) return;

	const msUntilRefresh = expiry - Date.now() - REFRESH_AHEAD_MS;
	if (msUntilRefresh <= 0) {
		// Token bereits abgelaufen oder kurz vor Ablauf → sofort refreshen
		refreshToken();
		return;
	}

	_refreshTimer = setTimeout(async () => {
		_refreshTimer = null;
		console.info('[Box Auth] Proaktiver Token-Refresh …');
		const ok = await refreshToken();
		if (ok) {
			startTokenRefreshTimer(); // neuen Timer für das frische Token setzen
		} else {
			console.warn('[Box Auth] Proaktiver Refresh fehlgeschlagen – Nutzer muss sich neu einloggen.');
		}
	}, msUntilRefresh);
}

/**
 * Stoppt den proaktiven Refresh-Timer (z.B. beim Logout).
 */
export function stopTokenRefreshTimer() {
	if (_refreshTimer) {
		clearTimeout(_refreshTimer);
		_refreshTimer = null;
	}
}

/**
 * Erneuert das Access Token still im Hintergrund via Refresh Token.
 * @returns {Promise<boolean>} true wenn erfolgreich
 */
export async function refreshToken() {
	if (!browser) return false;

	// Parallele Refresh-Requests verhindern
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
 * Gibt den eingeloggten Nutzer zurück.
 * @returns {{ name: string, login: string } | null}
 */
export function getUser() {
	if (!browser) return null;
	const raw = localStorage.getItem(STORAGE_KEY_USER);
	return raw ? JSON.parse(raw) : null;
}

/**
 * Loggt den Nutzer aus (löscht lokalen State).
 */
export function logout() {
	stopTokenRefreshTimer();
	localStorage.removeItem(STORAGE_KEY_TOKEN);
	localStorage.removeItem(STORAGE_KEY_REFRESH);
	localStorage.removeItem(STORAGE_KEY_EXPIRY);
	localStorage.removeItem(STORAGE_KEY_USER);
	// Box hat keine Server-seitige Logout-URL für SPAs
	window.location.reload();
}

// ── Interne Helpers ────────────────────────────────────────────────────────

/**
 * Speichert Access + Refresh Token aus einer Token-Response.
 * Berechnet und speichert auch den Ablaufzeitpunkt des Access Tokens.
 * @param {Record<string, string>} data
 */
function saveTokens(data) {
	if (data.access_token)  localStorage.setItem(STORAGE_KEY_TOKEN,   data.access_token);
	if (data.refresh_token) localStorage.setItem(STORAGE_KEY_REFRESH, data.refresh_token);

	// Box liefert expires_in in Sekunden (Standard: 3600 = 1h)
	const expiresIn = parseInt(String(data.expires_in ?? '3600'), 10);
	const expiry = Date.now() + expiresIn * 1000;
	localStorage.setItem(STORAGE_KEY_EXPIRY, String(expiry));

	const userName = data.token_extra_info?.name ?? null;
	if (userName) localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({ name: userName, login: '' }));
}

