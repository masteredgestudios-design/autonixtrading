import { convertFromUsd, convertToUsd, formatDisplayMoney } from '../currency.service';

describe('currency service', () => {
    it('converts USD values to KES using the supplied rate', () => {
        expect(convertFromUsd(1, 'KES', 129)).toBe(129);
        expect(convertFromUsd(5, 'KES', 129)).toBe(645);
        expect(convertFromUsd(10, 'KES', 129)).toBe(1290);
        expect(convertFromUsd(50, 'KES', 129)).toBe(6450);
        expect(convertFromUsd(100, 'KES', 129)).toBe(12900);
    });

    it('converts KES input back to the USD source value', () => {
        expect(convertToUsd(645, 'KES', 129)).toBe(5);
        expect(convertToUsd(1290, 'KES', 129)).toBe(10);
    });

    it('formats the selected display currency', () => {
        expect(formatDisplayMoney(10, 'USD', 129)).toBe('$10.00');
        expect(formatDisplayMoney(10, 'KES', 129)).toBe('KSh 1,290.00');
    });
});