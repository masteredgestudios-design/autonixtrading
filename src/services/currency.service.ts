export type DisplayCurrency = 'USD' | 'KES';

export const DISPLAY_CURRENCY_STORAGE_KEY = 'display_currency';
export const USD_TO_KES_STORAGE_KEY = 'usd_to_kes_rate';

export const roundMoney = (value: number, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const usdToKes = (amount: number, rate: number) => roundMoney(amount * rate);

export const kesToUsd = (amount: number, rate: number) => roundMoney(amount / rate);

export const convertFromUsd = (amount: number, currency: DisplayCurrency, rate: number) =>
    currency === 'KES' && rate > 0 ? usdToKes(amount, rate) : amount;

export const convertToUsd = (amount: number, currency: DisplayCurrency, rate: number) =>
    currency === 'KES' && rate > 0 ? kesToUsd(amount, rate) : amount;

export const formatDisplayMoney = (
    amount: number | string,
    currency: DisplayCurrency,
    rate: number,
    options: Intl.NumberFormatOptions = {}
) => {
    const value = Number(String(amount).replace(/,/g, '')) || 0;
    const converted = convertFromUsd(value, currency, rate);
    const formatted = new Intl.NumberFormat('en-KE', {
        minimumFractionDigits: currency === 'KES' ? 2 : 2,
        maximumFractionDigits: currency === 'KES' ? 2 : 2,
        ...options,
    }).format(converted);
    return currency === 'KES' ? `KSh ${formatted}` : `$${formatted}`;
};

export const fetchUsdToKesRate = async (): Promise<number> => {
    const response = await fetch('/api/exchange-rate', { credentials: 'include' });
    if (!response.ok) throw new Error(`Exchange rate request failed: ${response.status}`);
    const data = (await response.json()) as { rate?: number };
    if (!data.rate || !Number.isFinite(data.rate) || data.rate <= 0) throw new Error('Invalid exchange rate');
    return data.rate;
};