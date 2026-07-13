/**
 * IBM w3id / Azure AD Authentifizierung via MSAL.js (PKCE-Flow)
 *
 * IBM-Mitarbeiter haben @ibm.com = Microsoft Entra ID (Azure AD).
 * MSAL.js v3 erledigt den PKCE-Flow vollständig im Browser – kein Backend nötig.
 *
 * Setup (einmalig, vom Entwickler):
 *   1. Azure Portal → App Registrations → New Registration
 *      - Name: "IBM Todo App"
 *      - Supported account types: "Accounts in any organizational directory"
 *      - Redirect URI: https://simonhanischsag.github.io/ToDoList/
 *   2. API permissions → Microsoft Graph → Files.ReadWrite (delegated)
 *   3. Client ID in AUTH_CONFIG.clientId eintragen
 *
 * Datenschutz: Kein Client Secret, keine Tokens am Server.
 */

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { browser } from '$app/environment';

// ── Konfiguration ──────────────────────────────────────────────────────────
const AUTH_CONFIG = {
	auth: {
		// TODO: Ersetze mit deiner Azure App Registration Client ID
		clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? 'YOUR_CLIENT_ID_HERE',
		// IBM nutzt den gemeinsamen Microsoft-Tenant (Multi-Tenant)
		authority: 'https://login.microsoftonline.com/organizations',
		// Muss exakt mit der registrierten Redirect URI übereinstimmen
		redirectUri: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '/',
		postLogoutRedirectUri: '/'
	},
	cache: {
		cacheLocation: 'sessionStorage', // sicherer als localStorage (kein XSS-Risiko)
		storeAuthStateInCookie: false
	}
};

// Scopes: OpenID für Login + Microsoft Graph für OneDrive-Zugriff
export const LOGIN_SCOPES = ['openid', 'profile', 'email'];
export const GRAPH_SCOPES = ['Files.ReadWrite', 'User.Read'];

// ── MSAL-Instanz (Singleton) ───────────────────────────────────────────────
/** @type {PublicClientApplication | null} */
let msalInstance = null;

/**
 * Gibt die MSAL-Instanz zurück (lazy init, nur im Browser).
 * @returns {Promise<PublicClientApplication>}
 */
async function getMsal() {
	if (!browser) throw new Error('MSAL nur im Browser verfügbar');
	if (!msalInstance) {
		msalInstance = new PublicClientApplication(AUTH_CONFIG);
		await msalInstance.initialize();
		// Verarbeite Redirect-Response nach Login
		await msalInstance.handleRedirectPromise();
	}
	return msalInstance;
}

// ── Öffentliche API ────────────────────────────────────────────────────────

/**
 * Startet den Login-Redirect zu IBM w3id / Microsoft.
 * Wichtig: Popup ist auf iOS blockiert → immer Redirect verwenden.
 */
export async function login() {
	const msal = await getMsal();
	await msal.loginRedirect({
		scopes: [...LOGIN_SCOPES, ...GRAPH_SCOPES],
		prompt: 'select_account'
	});
}

/**
 * Loggt den Nutzer aus und leitet zurück zur App.
 */
export async function logout() {
	const msal = await getMsal();
	const account = msal.getActiveAccount();
	await msal.logoutRedirect({ account });
}

/**
 * Gibt den aktuell eingeloggten Account zurück, oder null.
 * @returns {Promise<import('@azure/msal-browser').AccountInfo | null>}
 */
export async function getAccount() {
	if (!browser) return null;
	const msal = await getMsal();
	const accounts = msal.getAllAccounts();
	if (accounts.length === 0) return null;
	msal.setActiveAccount(accounts[0]);
	return accounts[0];
}

/**
 * Holt ein gültiges Access Token für Microsoft Graph (silent refresh).
 * Falls nötig, wird ein neuer Redirect ausgelöst.
 * @returns {Promise<string>} Bearer Token
 */
export async function getGraphToken() {
	const msal = await getMsal();
	const account = msal.getActiveAccount();
	if (!account) throw new Error('Nicht eingeloggt');

	try {
		const result = await msal.acquireTokenSilent({
			scopes: GRAPH_SCOPES,
			account
		});
		return result.accessToken;
	} catch (err) {
		if (err instanceof InteractionRequiredAuthError) {
			// Token abgelaufen oder neue Zustimmung nötig → Redirect
			await msal.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account });
		}
		throw err;
	}
}
