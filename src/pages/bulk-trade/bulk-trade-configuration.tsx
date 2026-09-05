import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ApiHelpers } from '@/external/bot-skeleton';
import { useCurrency } from '@/contexts/currency-context';
import { useStore } from '@/hooks/useStore';
import BulkTradeExecutor from '@/services/bulk-trade-executor';
import { localize } from '@deriv-com/translations';
import './bulk-trade-configuration.scss';

const TYPES = { even_odd: ['even', 'odd'], over_under: ['over', 'under'], rise_fall: ['rise', 'fall'], differs: ['differs'] } as const;
const labels: Record<string, string> = { even_odd: 'Even / Odd', over_under: 'Over / Under', rise_fall: 'Rise / Fall', differs: 'Differs', even: 'Even', odd: 'Odd', over: 'Over', under: 'Under', rise: 'Rise', fall: 'Fall', differs: 'Differs' };

const BulkTradeConfiguration = observer(() => {
    const { bulk_trade } = useStore();
    const { currency, rate, formatMoney, toUsd } = useCurrency();
    const [symbols, setSymbols] = useState<{ text: string; value: string }[]>([]);
    const [durations, setDurations] = useState<string[]>([]);
    const [stake, setStake] = useState(String(currency === 'USD' ? bulk_trade.config.stake_usd : formatMoney(bulk_trade.config.stake_usd)));
    const executor = useRef<BulkTradeExecutor | null>(null);
    const config = bulk_trade.config;
    const needsDigit = config.trade_type === 'over_under' || config.trade_type === 'differs';

    useEffect(() => { let active = true; const load = async () => { try { await (ApiHelpers as any).instance?.active_symbols?.retrieveActiveSymbols?.(true); const next = (ApiHelpers as any).instance?.active_symbols?.getSymbolsForBot?.() || []; if (active) { setSymbols(next); if (!next.some((item: any) => item.value === config.symbol)) bulk_trade.setConfig({ symbol: next[0]?.value || '' }); } } catch { if (active) setSymbols([]); } }; void load(); return () => { active = false; }; }, []);
    useEffect(() => { let active = true; const load = async () => { if (!config.symbol) return; try { const next = await (ApiHelpers as any).instance?.contracts_for?.getDurations?.(config.symbol, config.trade_type); if (active) { const values = (next || []).map((item: any) => typeof item === 'string' ? item : `${item.min || 1}${item.unit || 't'}`); setDurations(values); if (!values.includes(config.duration)) bulk_trade.setConfig({ duration: values[0] || '' }); } } catch { if (active) setDurations([]); } }; void load(); return () => { active = false; }; }, [config.symbol, config.trade_type]);
    useEffect(() => { setStake(currency === 'USD' ? String(config.stake_usd) : formatMoney(config.stake_usd)); }, [currency, rate]);

    const submit = async () => {
        if (!config.symbol || !config.duration || config.stake_usd <= 0 || config.number_of_trades < 1 || (needsDigit && config.digit === undefined)) {
            alert(localize('Complete the required fields before continuing.'));
            return;
        }

        const batch = bulk_trade.startBatch();
        if (!batch) return;

        run_panel.toggleDrawer(true);
        executor.current = new BulkTradeExecutor(bulk_trade);
        try {
            await executor.current.execute(batch);
        } catch (error: any) {
            bulk_trade.finishBatch();
            alert(error?.message || 'Unable to start bulk trade.');
        }
    };

    useEffect(() => () => executor.current?.cleanup(), []);

    return <div className='bulk-trade-form'>
        <div className='bulk-trade-form__grid'>
            <label>Symbol<select value={config.symbol} onChange={e => bulk_trade.setConfig({ symbol: e.target.value })}><option value=''>Select active market</option>{symbols.map(symbol => <option key={symbol.value} value={symbol.value}>{symbol.text} ({symbol.value})</option>)}</select></label>
            <label>Trade Type<select value={config.trade_type} onChange={e => bulk_trade.setTradeType(e.target.value as any)}>{Object.keys(TYPES).map(type => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
            <label>Direction<select value={config.direction} onChange={e => bulk_trade.setConfig({ direction: e.target.value as any })}>{TYPES[config.trade_type].map(direction => <option key={direction} value={direction}>{labels[direction]}</option>)}</select></label>
            {needsDigit && <label>Digit<select value={config.digit} onChange={e => bulk_trade.setConfig({ digit: Number(e.target.value) })}>{Array.from({ length: 10 }, (_, digit) => <option key={digit} value={digit}>{digit}</option>)}</select></label>}
            <label>Duration<select value={config.duration} onChange={e => bulk_trade.setConfig({ duration: e.target.value })}>{durations.map(duration => <option key={duration} value={duration}>{duration === '1t' ? '1 Tick' : duration}</option>)}</select></label>
            <label>Stake ({currency})<input value={stake} inputMode='decimal' onChange={e => { setStake(e.target.value); const value = Number(e.target.value.replace(/[^0-9.]/g, '')); if (Number.isFinite(value)) bulk_trade.setConfig({ stake_usd: toUsd(value) }); }} /></label>
            <label>Number of Trades<input type='number' min='1' max='100' value={config.number_of_trades} onChange={e => bulk_trade.setConfig({ number_of_trades: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></label>
        </div>
        <button type='button' disabled={bulk_trade.is_executing} onClick={submit}>{bulk_trade.is_executing ? 'Bulk Trade Running' : 'Submit Trades'}</button>
    </div>;
});

export default BulkTradeConfiguration;
