import React from 'react';
import { getCurrencyDisplayCode } from '@/components/shared';
import { useCurrency } from '@/contexts/currency-context';

type TMoneyProps = {
    amount: number | string;
    className: string;
    currency: string;
    has_sign: boolean;
    should_format: boolean;
    show_currency: boolean; // if true, append currency symbol
};

const Money = ({
    amount = 0,
    className,
    currency = 'USD',
    has_sign,
    should_format = true,
    show_currency = false,
}: Partial<TMoneyProps>) => {
    const { formatMoney: formatDisplayMoney, currency: displayCurrency } = useCurrency();
    let sign = '';
    if (Number(amount) && (Number(amount) < 0 || has_sign)) {
        sign = Number(amount) > 0 ? '+' : '-';
    }

    // if it's formatted already then don't make any changes unless we should remove extra -/+ signs
    const value = has_sign || should_format ? Math.abs(Number(amount)) : amount;
    const final_amount = should_format
        ? formatDisplayMoney(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : value;

    return (
        <React.Fragment>
            <span>{has_sign && sign}</span>
            <span data-testid='dt_span' className={className}>
                {final_amount} {show_currency && !should_format && getCurrencyDisplayCode(displayCurrency)}
            </span>
        </React.Fragment>
    );
};

export default React.memo(Money);
