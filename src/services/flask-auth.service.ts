/**
 * Flask Authentication Service
 *
 * This service provides a unified authentication interface that uses Flask's
 * OAuth implementation as the source of truth. The Flask server handles:
 * - OAuth 2.0 + PKCE authentication with Deriv
 * - Session management (secure, server-side)
 * - Token refresh
 * - Token revocation on logout
 *
 * React uses this service to check authentication status and log in/out.
 */

export interface FlaskSessionUser {
    isAuthenticated: boolean;
    accounts?: Array<{
        account: string;
        currency: string;
        isVirtual: boolean;
        accountType: 'virtual' | 'real';
        balance: number;
    }>;
    activeAccount?: {
        account: string;
        currency: string;
        isVirtual: boolean;
        accountType: 'virtual' | 'real';
        balance: number;
    };
    displayId?: string;
    needsLegacyLink?: boolean;
}

/**
 * Fetch the current authentication session from Flask
 * Uses credentials: 'include' to send cookies and maintain session
 */
export async function getFlaskSession(): Promise<FlaskSessionUser | null> {
    try {
        const response = await fetch('/auth/session', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            if (response.status === 401) {
                return null;
            }
            throw new Error(`Failed to fetch session: ${response.statusText}`);
        }

        const data = await response.json() as FlaskSessionUser;
        return data;
    } catch (error) {
        console.error('[Flask Auth] Failed to get session:', error);
        return null;
    }
}

/**
 * Initiate login via Flask
 * Redirects to Flask's /auth/login endpoint which handles the full OAuth flow
 */
export function initiateFlaskLogin(): void {
    window.location.href = '/auth/login';
}

/**
 * Initiate signup via Flask
 * Similar to login but may have different Deriv OAuth prompt settings
 */
export function initiateFlaskSignup(): void {
    window.location.href = 'https://t.deriv.link?t=99THF5S5V9K8';
}

/**
 * Logout via Flask
 * Clears the Flask session and revokes tokens server-side
 * Then redirects to home
 */
export async function logoutFromFlask(): Promise<void> {
    try {
        const response = await fetch('/auth/logout', {
            method: 'GET',
            credentials: 'include',
        });

        if (!response.ok) {
            console.warn('[Flask Auth] Logout endpoint returned non-OK status:', response.status);
        }

        // Redirect to home after logout
        window.location.href = '/';
    } catch (error) {
        console.error('[Flask Auth] Failed to logout:', error);
        // Still redirect even if the API call failed
        window.location.href = '/';
    }
}

/**
 * Check if user is authenticated via Flask session
 */
export async function isAuthenticatedViaFlask(): Promise<boolean> {
    const session = await getFlaskSession();
    return session?.isAuthenticated === true;
}

/**
 * Get the active account from Flask session
 */
export async function getActiveAccountFromFlask() {
    const session = await getFlaskSession();
    return session?.activeAccount || null;
}

/**
 * Get all accounts from Flask session
 */
export async function getAccountsFromFlask() {
    const session = await getFlaskSession();
    return session?.accounts || [];
}
