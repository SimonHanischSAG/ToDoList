/**
 * IBM w3id / Azure AD authentication via MSAL.js (PKCE flow)
 *
 * IBM employees have @ibm.com = Microsoft Entra ID (Azure AD).
 * MSAL.js v3 handles the PKCE flow entirely in the browser – no backend needed.
 *
 * Setup (one-time, by the developer):
 *   1. Azure Portal → App Registrations → New Registration
 *      - Name: "IBM Todo App"
 *      - Supported account types: "Accounts in any organizational directory"
 *      - Redirect URI: https://simonhanischsag.github.io/ToDoList/
 *   2. API permissions → Microsoft Graph → Files.ReadWrite (delegated)
 *   3. Enter the Client ID in AUTH_CONFIG.clientId
 *
 * Privacy: no client secret, no tokens on the server.
 */

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { browser } from '$app/environment';

// ── Configuration ──────────────────────────────────────────────────────────
const AUTH_CONFIG = {
	auth: {
		// TODO: Replace with your Azure App Registration Client ID
		clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? 'YOUR_CLIENT_ID_HERE',
		// IBM uses the shared Microsoft tenant (multi-tenant)
		authority: 'https://login.microsoftonline.com/organizations',
		// Must exactly match the registered redirect URI
		redirectUri: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '/',
		postLogoutRedirectUri: '/'
	},
	cache: {
		cacheLocation: 'sessionStorage', // safer than localStorage (no XSS risk)
		storeAuthStateInCookie: false
	}
};

// Scopes: OpenID for login + Microsoft Graph for OneDrive access
export const LOGIN_SCOPES = ['openid', 'profile', 'email'];
export const GRAPH_SCOPES = ['Files.ReadWrite', 'User.Read'];

// ── MSAL instance (singleton) ──────────────────────────────────────────────
/** @type {PublicClientApplication | null} */
let msalInstance = null;

/**
 * Returns the MSAL instance (lazy init, browser only).
 * @returns {Promise<PublicClientApplication>}
 */
async function getMsal() {
	if (!browser) throw new Error('MSAL is only available in the browser');
	if (!msalInstance) {
		msalInstance = new PublicClientApplication(AUTH_CONFIG);
		await msalInstance.initialize();
		// Process redirect response after login
		await msalInstance.handleRedirectPromise();
	}
	return msalInstance;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Starts the login redirect to IBM w3id / Microsoft.
 * Important: popups are blocked on iOS → always use redirect.
 */
export async function login() {
	const msal = await getMsal();
	await msal.loginRedirect({
		scopes: [...LOGIN_SCOPES, ...GRAPH_SCOPES],
		prompt: 'select_account'
	});
}

/**
 * Logs the user out and redirects back to the app.
 */
export async function logout() {
	const msal = await getMsal();
	const account = msal.getActiveAccount();
	await msal.logoutRedirect({ account });
}

/**
 * Returns the currently logged-in account, or null.
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
 * Obtains a valid access token for Microsoft Graph (silent refresh).
 * If needed, triggers a new redirect.
 * @returns {Promise<string>} Bearer token
 */
export async function getGraphToken() {
	const msal = await getMsal();
	const account = msal.getActiveAccount();
	if (!account) throw new Error('Not logged in');

	try {
		const result = await msal.acquireTokenSilent({
			scopes: GRAPH_SCOPES,
			account
		});
		return result.accessToken;
	} catch (err) {
		if (err instanceof InteractionRequiredAuthError) {
			// Token expired or new consent required → redirect
			await msal.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account });
		}
		throw err;
	}
}
