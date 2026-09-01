import { useCallback } from 'react';
import { clearAuthInfo } from '@/external/deriv-core';
import { useStore } from '@/hooks/useStore';
import { ErrorLogger } from '@/utils/error-logger';
import { logoutFromFlask } from '@/services/flask-auth.service';

/**
 * Custom hook to handle logout functionality
 * Uses Flask's logout endpoint which clears the session and revokes tokens server-side
 * @returns {Function} handleLogout - Function to trigger the logout process
 */
export const useLogout = () => {
    const { client } = useStore() ?? {};

    return useCallback(async () => {
        try {
            // Use Flask's logout endpoint which handles session clearing and token revocation
            await logoutFromFlask();
            // If we get here, the logout was successful and we've been redirected
        } catch (error) {
            ErrorLogger.error('Logout', 'Logout failed', error);
            // If logout fails, clear only auth-related storage keys
            // This preserves user preferences (theme, language, etc.) while ensuring auth data is cleared
            try {
                // Clear auth token via vendored deriv-core
                clearAuthInfo();

                // Clear auth-related localStorage items
                localStorage.removeItem('active_loginid');
                localStorage.removeItem('authToken');
                localStorage.removeItem('accountsList');
                localStorage.removeItem('clientAccounts');
                localStorage.removeItem('account_type');
            } catch (storageError) {
                ErrorLogger.error('Logout', 'Failed to clear auth storage', storageError);
                // Last resort: if targeted clearing fails, clear all storage
                try {
                    sessionStorage.clear();
                    localStorage.clear();
                } catch (finalError) {
                    ErrorLogger.error('Logout', 'Failed to clear all storage', finalError);
                }
            }
        }
    }, [client]);
};
