import React from 'react';
import { render } from '@testing-library/react';

jest.mock('@deriv/quill-icons/Markets', () => ({
    MarketForexAudsgdIcon: { invalid: true },
    MarketForexAudcadIcon: () => <svg data-testid='market-icon-ok' />,
    MarketDerivedVolatility100Icon: () => <svg data-testid='market-icon-vol' />,
    IllustrativeMarketsIcon: () => <svg data-testid='market-icon-illustrative' />,
}));

jest.mock('@deriv/quill-icons/TradeTypes', () => ({
    TradeTypesDigitsOverIcon: { invalid: true },
    TradeTypesDigitsUnderIcon: () => <svg data-testid='trade-icon-ok' />,
    TradeTypesHighsAndLowsHigherIcon: () => <svg data-testid='trade-icon-higher' />,
}));

import { MarketIcon } from './market-icon';
import { TradeTypeIcon } from '../trade-type/trade-type-icon';

describe('icon fallbacks', () => {
    it('renders a fallback instead of throwing when a market icon export is not a React element type', async () => {
        expect(() => render(<MarketIcon type='FRXAUDPLN' />)).not.toThrow();
    });

    it('renders a fallback instead of throwing when a trade icon export is not a React element type', async () => {
        expect(() => render(<TradeTypeIcon type='DIGITOVER' />)).not.toThrow();
    });
});
