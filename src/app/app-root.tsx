import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ErrorBoundary from '@/components/error-component/error-boundary';
import ErrorComponent from '@/components/error-component/error-component';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import './app-root.scss';

const AppContent = lazy(() => import('./app-content'));

const AppRootLoader = () => {
    return <ChunkLoader message={localize('Loading...')} />;
};

const loadFlaskSession = async () => {
    try {
        const response = await fetch('/auth/session', { credentials: 'include' });
        if (!response.ok) return;

        const user = await response.json();
        if (!user?.isAuthenticated || !Array.isArray(user.accounts)) return;

        const accounts = user.accounts.map((account: any) => ({
            account_id: account.account,
            balance: String(account.balance ?? 0),
            currency: account.currency ?? 'USD',
            group: account.group ?? '',
            status: account.status ?? 'active',
            account_type: account.isVirtual ? 'demo' : 'real',
        }));
        const accountList = Object.fromEntries(accounts.map((account: any) => [account.account_id, '']));
        const clientAccounts = Object.fromEntries(
            accounts.map((account: any) => [account.account_id, { currency: account.currency }])
        );

        sessionStorage.setItem('deriv_accounts', JSON.stringify(accounts));
        localStorage.setItem('accountsList', JSON.stringify(accountList));
        localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
        localStorage.setItem('active_loginid', user.activeAccount?.account ?? accounts[0]?.account_id ?? '');
        localStorage.setItem('account_type', user.activeAccount?.isVirtual ? 'demo' : 'real');
    } catch (error) {
        console.error('[FlaskAuth] Session bootstrap failed:', error);
    }
};

const ErrorComponentWrapper = observer(() => {
    const { common } = useStore();

    if (!common.error) return null;

    return (
        <ErrorComponent
            header={common.error?.header}
            message={common.error?.message}
            redirect_label={common.error?.redirect_label}
            redirectOnClick={common.error?.redirectOnClick}
            should_clear_error_on_click={common.error?.should_clear_error_on_click}
            setError={common.setError}
            redirect_to={common.error?.redirect_to}
            should_redirect={common.error?.should_redirect}
        />
    );
});

const AppRoot = () => {
    const store = useStore();
    const api_base_initialized = useRef(false);
    const [is_api_initialized, setIsApiInitialized] = useState(false);

    // Initialize API
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (!is_api_initialized) {
                setIsApiInitialized(true);
            }
        }, 5000);

        const initializeApi = async () => {
            if (!api_base_initialized.current) {
                try {
                    await loadFlaskSession();
                    await api_base.init();
                    api_base_initialized.current = true;
                } catch (error) {
                    console.error('API initialization failed:', error);
                    api_base_initialized.current = false;
                } finally {
                    setIsApiInitialized(true);
                    clearTimeout(timeoutId); // Clear timeout if API init completes
                }
            }
        };

        initializeApi();
        return () => clearTimeout(timeoutId);
    }, []);

    if (!store || !is_api_initialized) return <AppRootLoader />;

    return (
        <Suspense fallback={<AppRootLoader />}>
            <ErrorBoundary root_store={store}>
                <ErrorComponentWrapper />
                <AppContent />
            </ErrorBoundary>
        </Suspense>
    );
};

export default AppRoot;
