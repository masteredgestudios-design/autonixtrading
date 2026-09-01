import { useEffect } from 'react';
import { clearAuthInfo } from '@/external/deriv-core';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { ErrorLogger } from '@/utils/error-logger';
import { reloadPage, replaceUrl } from '@/utils/navigation-utils';
import { initiateFlaskLogin } from '@/services/flask-auth.service';

/**
 * Hook to handle invalid token events by clearing auth data and redirecting to Flask login
 *
 * This hook listens for 'InvalidToken' events emitted by the API base when
 * a token is invalid. When such an event is detected, it clears the invalid
 * authentication data and redirects to Flask login to prevent infinite reload loops.
 *
 * @returns {{ unregisterHandler: () => void }} An object containing a function to unregister the event handler
 */
export const useInvalidTokenHandler = (): { unregisterHandler: () => void } => {
    const handleInvalidToken = async () => {
        try {
            // Clear invalid auth token via vendored deriv-core
            clearAuthInfo();
            localStorage.removeItem('active_loginid');
            localStorage.removeItem('authToken');
            localStorage.removeItem('accountsList');
            localStorage.removeItem('clientAccounts');

            // Clear sessionStorage completely to remove any stale auth data
            sessionStorage.clear();

            // Redirect to Flask login which handles the OAuth flow
            try {
                initiateFlaskLogin();
            } catch (error) {
                ErrorLogger.error('InvalidToken', 'Failed to initiate Flask login, falling back to reload');
                reloadPage();
            }
        } catch (error) {
            ErrorLogger.error('InvalidToken', 'Error handling invalid token', error);
            // Last resort: reload the page
            reloadPage();
        }
    };

    // Subscribe to the InvalidToken event
    useEffect(() => {
        globalObserver.register('InvalidToken', handleInvalidToken);

        // Cleanup the subscription when the component unmounts
        return () => {
            globalObserver.unregister('InvalidToken', handleInvalidToken);
        };
    }, []);

    // Return a function to unregister the handler manually if needed
    return {
        unregisterHandler: () => {
            globalObserver.unregister('InvalidToken', handleInvalidToken);
        },
    };
};

export default useInvalidTokenHandler;
