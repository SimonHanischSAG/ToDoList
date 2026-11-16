/**
 * Auth backend selection – see ../backend.js for how to switch.
 * 'folder': local Box Drive folder (File System Access API, no OAuth)
 * 'box':    Box OAuth 2.0 PKCE
 */

import { BACKEND } from '../backend.js';
import * as folder from './folder.js';
import * as box from './box.js';

const impl = BACKEND === 'box' ? box : folder;

export const login = () => impl.login();
export const handleRedirect = () => impl.handleRedirect();
export const getToken = () => impl.getToken();
export const getUser = () => impl.getUser();
export const logout = () => impl.logout();
export const startTokenRefreshTimer = () => impl.startTokenRefreshTimer();
export const stopTokenRefreshTimer = () => impl.stopTokenRefreshTimer();
export const refreshToken = () => impl.refreshToken();

/** UI labels depending on backend */
export const LOGIN_LABEL  = BACKEND === 'box' ? 'Sign in with Box' : 'Connect Box folder';
export const LOGOUT_LABEL = BACKEND === 'box' ? 'Logout' : 'Disconnect';
