export type TransferDirection = 'from_wallet' | 'to_wallet';

export type TransferWallet = {
    wallet_id: string;
    currency: string;
    balance: number;
    wallet_currency?: string;
    exchange_rate?: number | string;
    rate_token?: string;
};

export type TransferAccount = {
    account_id: string;
    currency: string;
    balance: number;
    platform_name: 'options';
};

export type TransferOptions = {
    wallets: TransferWallet[];
    accounts: TransferAccount[];
};

const parseError = async (response: Response, fallback: string) => {
    try {
        const payload = await response.json();
        const detail = payload?.detail;
        const message = typeof detail === 'string' ? detail : detail?.message || detail?.error;
        if (message?.toLowerCase().includes('insufficient scopes')) {
            return 'Transfer access is not enabled for this session. Please sign out and sign in again.';
        }
        return message || payload?.error || fallback;
    } catch {
        return fallback;
    }
};

export const getTransferOptions = async (): Promise<TransferOptions> => {
    const response = await fetch('/api/transfers/options', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await parseError(response, 'Unable to load transfer accounts.'));
    return response.json() as Promise<TransferOptions>;
};

export const submitTransfer = async (payload: {
    wallet_id: string;
    amount: string;
    direction: TransferDirection;
    platform_name: 'options';
    platform_account_id: string;
    description?: string;
    wallet_currency?: string;
    exchange_rate?: number | string;
    rate_token?: string;
}) => {
    const response = await fetch('/api/transfers', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await parseError(response, 'The transfer could not be completed.'));
    return response.json();
};
