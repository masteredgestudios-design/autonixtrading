import { useCurrency } from '@/contexts/currency-context';

const DisplayCurrencySwitcher = () => {
    const { currency, setCurrency } = useCurrency();

    return (
        <div className='display-currency-switcher'>
            <select
                aria-label='Display currency'
                value={currency}
                onChange={event => setCurrency(event.target.value as 'USD' | 'KES')}
            >
                <option value='USD'>USD ($)</option>
                <option value='KES'>KES (KSh)</option>
            </select>
        </div>
    );
};

export default DisplayCurrencySwitcher;