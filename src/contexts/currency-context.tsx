import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    convertFromUsd,
    convertToUsd,
    DISPLAY_CURRENCY_STORAGE_KEY,
    fetchUsdToKesRate,
    formatDisplayMoney,
    type DisplayCurrency,
    USD_TO_KES_STORAGE_KEY,
} from '@/services/currency.service';

type CurrencyContextValue = {
    currency: DisplayCurrency;
    rate: number;
    setCurrency: (currency: DisplayCurrency) => void;
    formatMoney: (amount: number | string, options?: Intl.NumberFormatOptions) => string;
    fromUsd: (amount: number | string) => number;
    toUsd: (amount: number | string) => number;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
    const [currency, setCurrencyState] = useState<DisplayCurrency>(() => {
        const saved = localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
        return saved === 'KES' ? 'KES' : 'USD';
    });
    const [rate, setRate] = useState(() => Number(localStorage.getItem(USD_TO_KES_STORAGE_KEY)) || 0);

    useEffect(() => {
        let active = true;
        fetchUsdToKesRate()
            .then(nextRate => {
                if (!active) return;
                setRate(nextRate);
                localStorage.setItem(USD_TO_KES_STORAGE_KEY, String(nextRate));
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    const setCurrency = (nextCurrency: DisplayCurrency) => {
        setCurrencyState(nextCurrency);
        localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, nextCurrency);
    };

    const value = {
        currency,
        rate,
        setCurrency,
        formatMoney: (amount: number | string, options?: Intl.NumberFormatOptions) =>
            formatDisplayMoney(amount, currency, rate, options),
        fromUsd: (amount: number | string) => convertFromUsd(Number(amount) || 0, currency, rate),
        toUsd: (amount: number | string) => convertToUsd(Number(amount) || 0, currency, rate),
    };

    return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    return context ?? {
        currency: 'USD' as DisplayCurrency,
        rate: 0,
        setCurrency: () => undefined,
        formatMoney: (amount: number | string) => formatDisplayMoney(amount, 'USD', 0),
        fromUsd: (amount: number | string) => Number(amount) || 0,
        toUsd: (amount: number | string) => Number(amount) || 0,
    };
};