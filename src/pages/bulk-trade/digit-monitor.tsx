import React, { useEffect, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import './digit-monitor.scss';

type DigitState = { counts: number[]; total: number; latestTick: string; latestDigit?: number; status: 'waiting' | 'live' | 'error' };

const emptyState: DigitState = { counts: Array(10).fill(0), total: 0, latestTick: '', status: 'waiting' };

const getPrecision = (symbol: string) => {
    const metadata = (api_base.active_symbols || []).find((item: any) => (item.symbol || item.value) === symbol);
    const storedPrecision = Number((api_base.pip_sizes as any)?.[symbol]);
    if (Number.isInteger(storedPrecision) && storedPrecision >= 0) return storedPrecision;

    const pipSize = Number(metadata?.pip_size || metadata?.pip);
    if (!Number.isFinite(pipSize) || pipSize <= 0) return undefined;
    return Math.max(0, Math.round(-Math.log10(pipSize)));
};

const formatTick = (quote: unknown, precision: number) => {
    const numericQuote = typeof quote === 'number' ? quote : Number(quote);
    if (!Number.isFinite(numericQuote)) return undefined;
    return numericQuote.toFixed(precision);
};

const tickDigit = (formattedTick: string, precision: number) => {
    const digits = precision > 0 ? formattedTick.split('.')[1] : formattedTick;
    const digit = Number(digits?.slice(-1));
    return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : undefined;
};

const DigitMonitor = ({ symbol }: { symbol: string }) => {
    const [state, setState] = useState<DigitState>(emptyState);
    const activeRequest = useRef(0);

    useEffect(() => {
        const requestId = ++activeRequest.current;
        let disposed = false;
        let subscriptionId: string | undefined;
        const history: number[] = [];
        const counts = Array(10).fill(0);
        const precision = getPrecision(symbol);
        const api = api_base.api as any;

        setState({ ...emptyState, counts: Array(10).fill(0), status: precision === undefined ? 'error' : 'waiting' });
        if (!symbol || !api || precision === undefined || !api.onMessage) return () => { disposed = true; };

        const publish = (formattedTick: string, digit: number, live: boolean) => {
            if (disposed || requestId !== activeRequest.current) return;
            history.push(digit);
            counts[digit] += 1;
            if (history.length > 1000) counts[history.shift() as number] -= 1;
            setState({ counts: [...counts], total: history.length, latestTick: formattedTick, latestDigit: digit, status: live ? 'live' : 'waiting' });
        };

        const listener = api.onMessage().subscribe((message: any) => {
            const data = message?.data ?? message;
            const tick = data?.msg_type === 'tick' ? data.tick : undefined;
            if (!tick || tick.symbol !== symbol) return;
            const formatted = formatTick(tick.quote, precision);
            const digit = formatted === undefined ? undefined : tickDigit(formatted, precision);
            if (formatted !== undefined && digit !== undefined) {
                subscriptionId = tick.id || data?.subscription?.id || subscriptionId;
                publish(formatted, digit, true);
            }
        });

        const start = async () => {
            try {
                const response = await api.send({ ticks_history: symbol, count: 1000, end: 'latest', style: 'ticks', subscribe: 1 });
                if (disposed || requestId !== activeRequest.current) return;
                subscriptionId = response?.subscription?.id;
                const prices = response?.history?.prices || [];
                prices.forEach((quote: unknown) => {
                    const formatted = formatTick(quote, precision);
                    const digit = formatted === undefined ? undefined : tickDigit(formatted, precision);
                    if (formatted !== undefined && digit !== undefined) publish(formatted, digit, false);
                });
            } catch {
                if (!disposed && requestId === activeRequest.current) setState({ ...emptyState, counts: Array(10).fill(0), status: 'error' });
            }
        };
        void start();

        return () => {
            disposed = true;
            listener?.unsubscribe?.();
            if (subscriptionId) void api.send({ forget: subscriptionId }).catch(() => undefined);
        };
    }, [symbol]);

    return <section className='digit-monitor' aria-label='Digit occurrence monitor'>
        <div className='digit-monitor__header'>
            <div><span className='eyebrow'>Market analysis</span><h2>Digit Occurrence <small>Last 1,000 Ticks</small></h2></div>
            <span className={`digit-monitor__status digit-monitor__status--${state.status}`}><i />{state.status === 'live' ? 'LIVE' : state.status === 'error' ? 'Unavailable' : 'Waiting for ticks...'}</span>
        </div>
        <div className='digit-monitor__latest'><div><span>Latest Tick</span><strong>{state.latestTick || '--'}</strong></div><div><span>Last Digit</span><strong className='digit-monitor__latest-digit'>{state.latestDigit ?? '--'}</strong></div><span className='digit-monitor__sample'>{state.total.toLocaleString()} ticks sampled</span></div>
        <div className='digit-monitor__legend'><span className='digit-monitor__legend-item digit-monitor__legend-item--most'><i />Most occurred</span><span className='digit-monitor__legend-item digit-monitor__legend-item--least'><i />Least occurred</span><span className='digit-monitor__legend-item digit-monitor__legend-item--latest'>⚡ Latest tick</span></div>
        <div className='digit-monitor__digits'>{Array.from({ length: 10 }, (_, digit) => {
            const percentage = state.total ? (state.counts[digit] / state.total) * 100 : 0;
            const hasData = state.total > 0;
            const mostOccurred = hasData && state.counts[digit] === Math.max(...state.counts);
            const leastOccurred = hasData && state.counts[digit] === Math.min(...state.counts);
            const latestTick = state.latestDigit === digit;
            return <div className={`digit-monitor__digit ${mostOccurred ? 'is-most' : ''} ${leastOccurred ? 'is-least' : ''} ${latestTick ? 'is-latest' : ''}`} key={digit}>
                {latestTick && <span className='digit-monitor__pointer' aria-label={`Latest tick digit ${digit}`}>⚡</span>}
                <span className='digit-monitor__circle'>{digit}</span><strong>{percentage.toFixed(1)}%</strong>
                <span className='digit-monitor__markers' aria-hidden='true'>{mostOccurred && <b className='digit-monitor__marker digit-monitor__marker--most'>Most</b>}{leastOccurred && <b className='digit-monitor__marker digit-monitor__marker--least'>Least</b>}</span>
            </div>;
        })}</div>
        {!symbol && <p className='digit-monitor__empty'>Select a market to begin monitoring.</p>}
    </section>;
};

export default DigitMonitor;