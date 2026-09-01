import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ApiHelpers } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { useCurrency } from '@/contexts/currency-context';
import { localize } from '@deriv-com/translations';
import './bulk-trade-configuration.scss';

const TRADE_TYPES = {
    even_odd: { label: 'Even/Odd', directions: ['even', 'odd'], hasDigit: false },
    over_under: { label: 'Over/Under', directions: ['over', 'under'], hasDigit: true },
    rise_fall: { label: 'Rise/Fall', directions: ['rise', 'fall'], hasDigit: false },
    differs: { label: 'Differs', directions: ['differs'], hasDigit: true },
};

const BulkTradeConfiguration = observer(() => {
    const { bulk_trade } = useStore();
    const { currency, rate, formatMoney, toUsd } = useCurrency();
    const [availableSymbols, setAvailableSymbols] = useState<Array<{ value: string; text: string }>>([]);
    const [availableDurations, setAvailableDurations] = useState<string[]>([]);
    const [displayStake, setDisplayStake] = useState(
        formatMoney(bulk_trade.config.stake)
    );

    useEffect(() => {
        let isMounted = true;

        const syncSymbols = async () => {
            const apiHelpers = (ApiHelpers as unknown as { instance?: { active_symbols?: any } })?.instance;
            const getActiveSymbols = apiHelpers?.active_symbols;

            try {
                await getActiveSymbols?.retrieveActiveSymbols?.(true);
                const symbols = getActiveSymbols?.getSymbolsForBot?.() ?? [];
                if (!isMounted) return;

                setAvailableSymbols(symbols);
                if (symbols.length && !symbols.some(symbol => symbol.value === bulk_trade.config.symbol)) {
                    bulk_trade.setSymbol(symbols[0].value);
                }
            } catch (error) {
                console.error('Bulk trade symbol load failed:', error);
                if (isMounted) {
                    setAvailableSymbols([]);
                }
            }
        };

        syncSymbols();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const syncDurations = async () => {
            if (!bulk_trade.config.symbol) {
                if (isMounted) setAvailableDurations([]);
                return;
            }

            const apiHelpers = (ApiHelpers as unknown as { instance?: { contracts_for?: any } })?.instance;
            const contractsFor = apiHelpers?.contracts_for;

            try {
                const durations = await contractsFor?.getDurations?.(bulk_trade.config.symbol, bulk_trade.config.trade_type);
                const normalizedDurations = Array.isArray(durations)
                    ? durations
                          .map(duration => {
                              if (typeof duration === 'string') return duration;
                              if (duration && typeof duration.unit === 'string') {
                                  return `${duration.min ?? 1}${duration.unit}`;
                              }
                              return null;
                          })
                          .filter((duration): duration is string => Boolean(duration))
                    : [];

                if (!isMounted) return;
                setAvailableDurations(normalizedDurations);

                if (
                    !normalizedDurations.some(duration => duration === bulk_trade.config.duration)
                ) {
                    bulk_trade.setDuration(normalizedDurations[0] ?? '');
                }
            } catch (error) {
                console.error('Bulk trade duration load failed:', error);
                if (isMounted) {
                    setAvailableDurations([]);
                    bulk_trade.setDuration('');
                }
            }
        };

        syncDurations();

        return () => {
            isMounted = false;
        };
    }, [bulk_trade.config.symbol, bulk_trade.config.trade_type]);

    const handleStakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const displayValue = e.target.value;
        setDisplayStake(displayValue);
        
        // Parse the display value and convert to USD
        const numValue = parseFloat(displayValue.replace(/[^0-9.]/g, ''));
        if (!isNaN(numValue)) {
            const usdValue = toUsd(numValue);
            bulk_trade.setStake(usdValue);
        }
    };

    const handleNumTradesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value)) {
            bulk_trade.setNumTrades(value);
        }
    };

    const handleDigitChange = (digit: number) => {
        bulk_trade.setDigit(digit);
    };

    const handleSubmitTrades = () => {
        // Validate configuration
        if (!bulk_trade.config.symbol) {
            alert(localize('Please select a symbol'));
            return;
        }
        if (!bulk_trade.config.duration) {
            alert(localize('Please select a duration'));
            return;
        }
        if (bulk_trade.config.stake <= 0) {
            alert(localize('Stake must be greater than 0'));
            return;
        }
        if (currency === 'KES' && rate <= 0) {
            alert(localize('Unable to convert KES to USD. Please try again when the exchange rate is available.'));
            return;
        }
        if (bulk_trade.config.num_trades < 1) {
            alert(localize('Number of trades must be at least 1'));
            return;
        }

        bulk_trade.openConfirmation();
    };

    const tradeTypeConfig = TRADE_TYPES[bulk_trade.config.trade_type];

    return (
        <div className='bulk-trade-configuration'>
            <div className='configuration-form'>
                {/* Configuration Grid - Top Section */}
                <div className='config-top-section'>
                    {/* Row 1: Symbol, Trade Type, Duration */}
                    <div className='form-row'>
                        <div className='form-group'>
                            <label className='form-label'>Symbol</label>
                            <select 
                                className='form-control'
                                value={bulk_trade.config.symbol}
                                onChange={(e) => bulk_trade.setSymbol(e.target.value)}
                            >
                                <option value=''>Select a symbol...</option>
                                {availableSymbols.length ? (
                                    availableSymbols.map(symbol => (
                                        <option key={symbol.value} value={symbol.value}>
                                            {symbol.text}
                                        </option>
                                    ))
                                ) : (
                                    <option value='' disabled>No live symbols available</option>
                                )}
                            </select>
                        </div>

                        <div className='form-group'>
                            <label className='form-label'>Trade Type</label>
                            <select 
                                className='form-control'
                                value={bulk_trade.config.trade_type}
                                onChange={(e) => bulk_trade.setTradeType(e.target.value as any)}
                            >
                                <option value='even_odd'>Even/Odd</option>
                                <option value='over_under'>Over/Under</option>
                                <option value='rise_fall'>Rise/Fall</option>
                                <option value='differs'>Differs</option>
                            </select>
                        </div>

                        <div className='form-group'>
                            <label className='form-label'>Duration</label>
                            <select 
                                className='form-control'
                                value={bulk_trade.config.duration}
                                onChange={(e) => bulk_trade.setDuration(e.target.value)}
                            >
                                <option value=''>Select duration...</option>
                                {availableDurations.map(d => (
                                    <option key={d} value={d}>{d === '1t' ? '1 Tick' : d}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Row 2: Direction, Digit (if applicable), Stake, Trades */}
                    <div className='form-row'>
                        <div className='form-group'>
                            <label className='form-label'>Direction</label>
                            <select 
                                className='form-control'
                                value={bulk_trade.config.direction}
                                onChange={(e) => bulk_trade.setDirection(e.target.value as any)}
                            >
                                {tradeTypeConfig.directions.map(direction => (
                                    <option key={direction} value={direction}>
                                        {direction.charAt(0).toUpperCase() + direction.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {tradeTypeConfig.hasDigit && (
                            <div className='form-group form-group--digit'>
                                <label className='form-label'>Digit</label>
                                <div className='digit-selector'>
                                    {Array.from({ length: 10 }, (_, i) => i).map(digit => (
                                        <button
                                            key={digit}
                                            className={`digit-button ${bulk_trade.config.digit === digit ? 'active' : ''}`}
                                            onClick={() => handleDigitChange(digit)}
                                        >
                                            {digit}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className='form-group'>
                            <label className='form-label'>Stake</label>
                            <input 
                                type='text'
                                className='form-control'
                                value={displayStake}
                                onChange={handleStakeChange}
                                placeholder='Enter amount'
                            />
                        </div>

                        <div className='form-group'>
                            <label className='form-label'>Number of Trades</label>
                            <input 
                                type='number'
                                className='form-control'
                                value={bulk_trade.config.num_trades}
                                onChange={handleNumTradesChange}
                                min='1'
                                max='100'
                            />
                        </div>
                    </div>
                </div>

                {/* Submit Button - Prominent CTA */}
                <div className='submit-section'>
                    <button 
                        className='btn-submit-trades'
                        onClick={handleSubmitTrades}
                        disabled={bulk_trade.is_executing}
                    >
                        {bulk_trade.is_executing ? 'Submitting Trades...' : 'Submit Trades'}
                    </button>
                </div>
            </div>
        </div>
    );
});

export default BulkTradeConfiguration;
