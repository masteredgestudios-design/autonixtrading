import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/shared_ui/button';
import Modal from '@/components/shared_ui/modal';
import { useStore } from '@/hooks/useStore';
import {
    getTransferOptions,
    submitTransfer,
    TransferAccount,
    TransferDirection,
    TransferOptions,
    TransferWallet,
} from '@/services/transfer.service';
import { Localize, localize } from '@deriv-com/translations';

type TransferProps = {
    is_open: boolean;
    on_close: () => void;
};

const Transfer = ({ is_open, on_close }: TransferProps) => {
    const { client } = useStore() ?? {};
    const [options, setOptions] = useState<TransferOptions | null>(null);
    const [direction, setDirection] = useState<TransferDirection>('from_wallet');
    const [walletId, setWalletId] = useState('');
    const [accountId, setAccountId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [is_loading, setIsLoading] = useState(false);
    const [is_submitting, setIsSubmitting] = useState(false);
    const [is_confirming, setIsConfirming] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState<{ amount: string; currency: string; direction: TransferDirection } | null>(null);

    const wallet = useMemo<TransferWallet | undefined>(() => options?.wallets.find(item => item.wallet_id === walletId), [options, walletId]);
    const account = useMemo<TransferAccount | undefined>(() => options?.accounts.find(item => item.account_id === accountId), [options, accountId]);
    const source = direction === 'from_wallet' ? wallet : account;
    const target = direction === 'from_wallet' ? account : wallet;
    const transferCurrency = direction === 'from_wallet' ? wallet?.currency : account?.currency;
    const availableBalance = Number(source?.balance ?? 0);

    useEffect(() => {
        if (!is_open) return;
        let cancelled = false;
        setError('');
        setSuccess(null);
        setIsConfirming(false);
        setIsLoading(true);
        getTransferOptions()
            .then(data => {
                if (cancelled) return;
                setOptions(data);
                setWalletId(current => current || data.wallets[0]?.wallet_id || '');
                setAccountId(current => current || data.accounts[0]?.account_id || '');
            })
            .catch(caught => !cancelled && setError(caught instanceof Error ? caught.message : localize('Unable to load transfer accounts.')))
            .finally(() => !cancelled && setIsLoading(false));
        return () => {
            cancelled = true;
        };
    }, [is_open]);

    const resetForm = () => {
        setAmount('');
        setDescription('');
        setIsConfirming(false);
    };

    const validate = () => {
        const parsed = Number(amount);
        if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || !Number.isFinite(parsed) || parsed <= 0) {
            return localize('Enter a valid amount greater than zero, with no more than two decimal places.');
        }
        if (parsed > availableBalance) return localize('The amount exceeds the available balance.');
        if (!wallet || !account) return localize('Select both a wallet and a real trading account.');
        return '';
    };

    const handleContinue = () => {
        const validationError = validate();
        setError(validationError);
        if (!validationError) setIsConfirming(true);
    };

    const handleSubmit = async () => {
        if (is_submitting) return;
        const validationError = validate();
        if (validationError || !wallet || !account) {
            setError(validationError || localize('Select both a wallet and a real trading account.'));
            setIsConfirming(false);
            return;
        }
        setError('');
        setIsSubmitting(true);
        try {
            await submitTransfer({
                wallet_id: wallet.wallet_id,
                amount: Number(amount).toFixed(2),
                direction,
                platform_name: 'options',
                platform_account_id: account.account_id,
                description: description.trim() || undefined,
                wallet_currency: wallet.wallet_currency,
                exchange_rate: wallet.exchange_rate,
                rate_token: wallet.rate_token,
            });
            setSuccess({ amount: Number(amount).toFixed(2), currency: transferCurrency || wallet.currency, direction });
            const refreshed = await getTransferOptions();
            setOptions(refreshed);
            client?.setBalance?.(String(refreshed.accounts.find(item => item.account_id === account.account_id)?.balance ?? client.balance));
            window.dispatchEvent(new CustomEvent('deriv-transfer-completed'));
            resetForm();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : localize('The transfer could not be completed.'));
            setIsConfirming(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal className='transfer-modal' is_open={is_open} toggleModal={on_close} title={localize('Transfer funds')} width='480px'>
            <Modal.Body>
                <div className='transfer-modal__body'>
                    {success && (
                        <div className='transfer-modal__success' role='status'>
                            <strong><Localize i18n_default_text='Transfer completed' /></strong>
                            <span>{success.amount} {success.currency} {success.direction === 'from_wallet' ? localize('transferred to your trading account.') : localize('transferred to your wallet.')}</span>
                        </div>
                    )}
                    {error && <div className='transfer-modal__error' role='alert'>{error}</div>}
                    {is_loading ? (
                        <div className='transfer-modal__loading'><Localize i18n_default_text='Loading your transfer accounts...' /></div>
                    ) : !options?.wallets.length || !options?.accounts.length ? (
                        <div className='transfer-modal__empty'><Localize i18n_default_text='No eligible wallet or real trading account is available.' /></div>
                    ) : is_confirming ? (
                        <div className='transfer-modal__confirmation'>
                            <strong><Localize i18n_default_text='Confirm this transfer' /></strong>
                            <p>{direction === 'from_wallet' ? localize('Transfer from your wallet to your trading account?') : localize('Transfer from your trading account to your wallet?')}</p>
                            <dl>
                                <dt><Localize i18n_default_text='Amount' /></dt><dd>{Number(amount).toFixed(2)} {transferCurrency}</dd>
                                <dt><Localize i18n_default_text='From' /></dt><dd>{direction === 'from_wallet' ? `${localize('Wallet')} (${wallet?.currency})` : account?.account_id}</dd>
                                <dt><Localize i18n_default_text='To' /></dt><dd>{direction === 'from_wallet' ? account?.account_id : `${localize('Wallet')} (${wallet?.currency})`}</dd>
                            </dl>
                            <div className='transfer-modal__actions'>
                                <Button secondary onClick={() => setIsConfirming(false)} disabled={is_submitting}><Localize i18n_default_text='Back' /></Button>
                                <Button primary onClick={handleSubmit} disabled={is_submitting}>{is_submitting ? localize('Transferring...') : localize('Confirm transfer')}</Button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={event => { event.preventDefault(); handleContinue(); }}>
                            <fieldset disabled={is_submitting}>
                                <label><Localize i18n_default_text='Transfer direction' /></label>
                                <div className='transfer-modal__directions'>
                                    <button type='button' className={direction === 'from_wallet' ? 'is-selected' : ''} onClick={() => setDirection('from_wallet')}><Localize i18n_default_text='Wallet to trading account' /></button>
                                    <button type='button' className={direction === 'to_wallet' ? 'is-selected' : ''} onClick={() => setDirection('to_wallet')}><Localize i18n_default_text='Trading account to wallet' /></button>
                                </div>
                                <label htmlFor='transfer-wallet'><Localize i18n_default_text='Wallet' /></label>
                                <select id='transfer-wallet' value={walletId} onChange={event => setWalletId(event.target.value)}>
                                    {options.wallets.map(item => <option key={item.wallet_id} value={item.wallet_id}>{item.currency} {localize('wallet')} ({Number(item.balance).toFixed(2)} {item.currency})</option>)}
                                </select>
                                <label htmlFor='transfer-account'><Localize i18n_default_text='Trading account' /></label>
                                <select id='transfer-account' value={accountId} onChange={event => setAccountId(event.target.value)}>
                                    {options.accounts.map(item => <option key={item.account_id} value={item.account_id}>{item.account_id} ({item.currency})</option>)}
                                </select>
                                <div className='transfer-modal__balance'><Localize i18n_default_text='Available balance' />: {Number(availableBalance).toFixed(2)} {source?.currency || transferCurrency}</div>
                                <label htmlFor='transfer-amount'><Localize i18n_default_text='Amount' /></label>
                                <div className='transfer-modal__amount'><input id='transfer-amount' inputMode='decimal' value={amount} onChange={event => setAmount(event.target.value)} placeholder='0.00' /><span>{transferCurrency}</span></div>
                                <label htmlFor='transfer-description'><Localize i18n_default_text='Description (optional)' /></label>
                                <input id='transfer-description' value={description} maxLength={240} onChange={event => setDescription(event.target.value)} />
                                <Button primary type='submit' disabled={is_submitting || !amount}>{localize('Review transfer')}</Button>
                            </fieldset>
                        </form>
                    )}
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default Transfer;
