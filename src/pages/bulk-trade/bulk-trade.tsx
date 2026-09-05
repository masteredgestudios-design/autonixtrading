import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import BulkTradeConfiguration from './bulk-trade-configuration';
import DigitMonitor from './digit-monitor';
import './bulk-trade.scss';

const BulkTrade = observer(() => {
    const { bulk_trade } = useStore();
    const stats = bulk_trade.statistics;
    return <div className='bulk-trade-page'>
        <header className='bulk-trade-page__header'><div><span className='bulk-trade-page__kicker'>Execution terminal</span><h1>Bulk Trader</h1><p>Configure and submit identical contracts as one batch.</p></div><div className='bulk-trade-page__market'><span>Selected market</span><strong>{bulk_trade.config.symbol || 'No market selected'}</strong></div></header>
        <main className='bulk-trade-page__content'>
            <div className='bulk-trade-page__workspace'><section className='bulk-trade-page__configuration'><div className='bulk-trade-page__section-title'><span className='bulk-trade-page__kicker'>Order setup</span><h2>Bulk Trade</h2></div><BulkTradeConfiguration />
                {bulk_trade.batch && <div className='bulk-trade-progress' aria-live='polite'>
                    <div className='bulk-trade-progress__heading'><strong>{bulk_trade.is_executing ? 'Bulk Trade Running' : 'Batch Complete'}</strong><span>{bulk_trade.batch.id}</span></div>
                    <div className='bulk-trade-progress__grid'><span>Requested <b>{stats.requested}</b></span><span>Submitted <b>{stats.submitted}</b></span><span>Completed <b>{stats.completed}</b></span><span>Pending <b>{stats.pending}</b></span><span>Wins <b>{stats.wins}</b></span><span>Losses <b>{stats.losses}</b></span><span>Failed <b>{stats.failed}</b></span></div>
                </div>}</section><DigitMonitor symbol={bulk_trade.config.symbol} /></div>
        </main>
    </div>;
});

export default BulkTrade;
