import { lazy, Suspense } from 'react';
import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router';
import { cleanupUrl } from '@/external/deriv-core';
import ChunkLoader from '@/components/loader/chunk-loader';
import LocalStorageSyncWrapper from '@/components/localStorage-sync-wrapper';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { useAccountSwitching } from '@/hooks/useAccountSwitching';
import { useLanguageFromURL } from '@/hooks/useLanguageFromURL';
import { StoreProvider } from '@/hooks/useStore';
import { isPreviewMode, PREVIEW_BASE_PATH } from '@/utils/is-preview-mode';
import { localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import i18nInstance from './i18n';
import { CurrencyProvider } from '@/contexts/currency-context';
import './app-root.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));

/**
 * Component wrapper to handle language URL parameter
 * Uses the useLanguageFromURL hook to process language switching
 */
const LanguageHandler = ({ children }: { children: React.ReactNode }) => {
    useLanguageFromURL();
    return <>{children}</>;
};

// The static preview build is served under /bot/preview (see rsbuild.config.ts
// assetPrefix), so React Router must resolve routes under that prefix. Standalone
// partner deploys are served at the root, so no basename there.
const routerBasename = isPreviewMode()
    ? PREVIEW_BASE_PATH
    : process.env.NEXT_PUBLIC_APP_BASE_PATH || undefined;

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path='/'
            element={
                <Suspense
                    fallback={<ChunkLoader message={localize('Please wait while we connect to the server...')} />}
                >
                    <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                        <CurrencyProvider>
                            <LanguageHandler>
                                <StoreProvider>
                                    <LocalStorageSyncWrapper>
                                        <RoutePromptDialog />
                                        <CoreStoreProvider>
                                            <Layout />
                                        </CoreStoreProvider>
                                    </LocalStorageSyncWrapper>
                                </StoreProvider>
                            </LanguageHandler>
                        </CurrencyProvider>
                    </TranslationProvider>
                </Suspense>
            }
        >
            {/* All child routes will be passed as children to Layout */}
            <Route index element={<AppRoot />} />
            {/* App Builder embeds the template at /preview — render the same app shell */}
            <Route path='preview' element={<AppRoot />} />
        </Route>
    ),
    { basename: routerBasename }
);

/**
 * Main App component
 *
 * Responsibilities:
 * 1. Account switching from URL (via useAccountSwitching hook)
 * 2. Dashboard redirect after successful login from Flask
 * 3. Router provider setup
 *
 * Authentication is handled by Flask. React checks Flask's /auth/session
 * endpoint via the CoreStoreProvider which manages authentication state.
 *
 * On mount, checks if the user is authenticated via Flask and redirects
 * to Dashboard if so (post-login behavior).
 */
function App() {
    // Handle account switching via URL parameter
    useAccountSwitching();

    React.useEffect(() => {
        // After successful login from Flask, redirect to Dashboard
        // Flask will set up the session and redirect to /trader
        // React should check if authenticated and redirect to Dashboard
        
        const checkAuthAndRedirect = async () => {
            try {
                const response = await fetch('/auth/session', {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                    },
                });

                if (response.ok) {
                    const sessionData = await response.json();
                    
                    // If authenticated, redirect to Dashboard
                    if (sessionData?.isAuthenticated === true) {
                        // Clean up any URL parameters from OAuth
                        cleanupUrl(window.location.origin);
                        
                        // Redirect to Dashboard using hash-based navigation
                        const currentUrl = new URL(window.location.href);
                        const languageParam = currentUrl.searchParams.get('lang');
                        let dashboardUrl = window.location.pathname;
                        
                        if (languageParam) {
                            dashboardUrl += `?lang=${languageParam}`;
                        }
                        
                        dashboardUrl += '#dashboard';
                        window.history.replaceState({}, '', dashboardUrl);
                    }
                }
            } catch (error) {
                console.error('[App] Failed to check auth session:', error);
                // Continue normally if check fails - let useApiBase handle authentication
            }
        };

        checkAuthAndRedirect();
    }, []);

    return <RouterProvider router={router} />;
}

export default App;
