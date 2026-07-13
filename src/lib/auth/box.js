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
const CLIENT_ID = import.meta.env.VITE_BOX_CLIENT_ID ?? '57mjnjrkdl2787qrsbcmk3zczhwa2en6';
const REDIRECT_URI = browser
	? window.location.origin + window.location.pathname.replace(/\/$/, '') + '/'
	: 'https://simonhanischsag.github.io/ToDoList/';

const BOX_AUTH_URL = 'https://account.box.com/api/oauth2/authorize';
const BOX_TOKEN_URL = 'https://api.box.com/oauth2/token';

const STORAGE_KEY_TOKEN    = 'box_access_token';
const STORAGE_KEY_VERIFIER = 'box_pkce_verifier';
const STORAGE_KEY_USER     = 'box_user';

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
		grant_type:    'authorization_code',
		client_id:     CLIENT_ID,
		code,
		code_verifier: verifier,
		redirect_uri:  REDIRECT_URI
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
	sessionStorage.setItem(STORAGE_KEY_TOKEN, data.access_token);

	// Nutzer-Profil laden
	const user = await fetchCurrentUser(data.access_token);
	if (user) sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));

	return true;
}

/**
 * Gibt das gespeicherte Access Token zurück.
 * @returns {string | null}
 */
export function getToken() {
	if (!browser) return null;
	return sessionStorage.getItem(STORAGE_KEY_TOKEN);
}

/**
 * Gibt den eingeloggten Nutzer zurück.
 * @returns {{ name: string, login: string } | null}
 */
export function getUser() {
	if (!browser) return null;
	const raw = sessionStorage.getItem(STORAGE_KEY_USER);
	return raw ? JSON.parse(raw) : null;
}

/**
 * Loggt den Nutzer aus (löscht lokalen State).
 */
export function logout() {
	sessionStorage.removeItem(STORAGE_KEY_TOKEN);
	sessionStorage.removeItem(STORAGE_KEY_USER);
	// Box hat keine Server-seitige Logout-URL für SPAs
	window.location.reload();
}

// ── Internes ───────────────────────────────────────────────────────────────

/**
 * Lädt das Profil des eingeloggten Nutzers via Box API.
 * @param {string} token
 * @returns {Promise<{ name: string, login: string } | null>}
 */
async function fetchCurrentUser(token) {
	const res = await fetch('https://api.box.com/2.0/users/me', {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) return null;
	const data = await res.json();
	return { name: data.name, login: data.login };
}
