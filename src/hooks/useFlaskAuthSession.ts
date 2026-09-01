/**
 * Hook to synchronize Flask authentication state with React
 *
 * This hook:
 * 1. Checks Flask's /auth/session endpoint on mount
 * 2. Syncs the authenticated user data with React state
 * 3. Polls for session changes
 * 4. Handles logout detection
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getFlaskSession, FlaskSessionUser } from '@/services/flask-auth.service';

export interface UseFlaskAuthSession {
    isAuthenticated: boolean;
    isLoading: boolean;
    session: FlaskSessionUser | null;
    error: Error | null;
    refreshSession: () => Promise<void>;
}

// Poll interval in milliseconds - check for session changes every 10 seconds
const SESSION_POLL_INTERVAL = 10000;

// Retry interval if session check fails
const RETRY_INTERVAL = 3000;

export function useFlaskAuthSession(): UseFlaskAuthSession {
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [session, setSession] = useState<FlaskSessionUser | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);

    const refreshSession = useCallback(async () => {
        try {
            const sessionData = await getFlaskSession();

            if (!isMountedRef.current) return;

            if (sessionData) {
                setSession(sessionData);
                setIsAuthenticated(sessionData.isAuthenticated === true);
                setError(null);
            } else {
                setSession(null);
                setIsAuthenticated(false);
                setError(null);
            }

            setIsLoading(false);

            // Clear any retry timers since we succeeded
            if (retryIntervalRef.current) {
                clearTimeout(retryIntervalRef.current);
                retryIntervalRef.current = null;
            }
        } catch (err) {
            if (!isMountedRef.current) return;

            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            setIsLoading(false);

            // Set up retry on error
            if (!retryIntervalRef.current) {
                retryIntervalRef.current = setTimeout(() => {
                    retryIntervalRef.current = null;
                    refreshSession();
                }, RETRY_INTERVAL);
            }
        }
    }, []);

    // Initial session check on mount
    useEffect(() => {
        isMountedRef.current = true;
        refreshSession();

        return () => {
            isMountedRef.current = false;
        };
    }, [refreshSession]);

    // Set up polling for session changes
    useEffect(() => {
        // Don't start polling until initial load is complete
        if (isLoading) return;

        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
        }

        pollIntervalRef.current = setInterval(() => {
            refreshSession();
        }, SESSION_POLL_INTERVAL);

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, [isLoading, refreshSession]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
            if (retryIntervalRef.current) {
                clearTimeout(retryIntervalRef.current);
            }
            isMountedRef.current = false;
        };
    }, []);

    return {
        isAuthenticated,
        isLoading,
        session,
        error,
        refreshSession,
    };
}
