import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import BulkTradeConfiguration from './bulk-trade-configuration';
import ConfirmationDialog from './confirmation-dialog';
import './bulk-trade.scss';

const BulkTrade = observer(() => {
    const { bulk_trade } = useStore();
    const stats = bulk_trade.statistics;
    return <div className='bulk-trade-page'>
        <header className='bulk-trade-page__header'><h1>Bulk Trade</h1><p>Submit identical contracts together as one batch.</p></header>
        <main className='bulk-trade-page__content'>
            <section className='bulk-trade-page__configuration'>
                <BulkTradeConfiguration />
                {bulk_trade.batch && <div className='bulk-trade-progress' aria-live='polite'>
                    <div className='bulk-trade-progress__heading'><strong>{bulk_trade.is_executing ? 'Bulk Trade Running' : 'Batch Complete'}</strong><span>{bulk_trade.batch.id}</span></div>
                    <div className='bulk-trade-progress__grid'><span>Requested <b>{stats.requested}</b></span><span>Submitted <b>{stats.submitted}</b></span><span>Completed <b>{stats.completed}</b></span><span>Pending <b>{stats.pending}</b></span><span>Wins <b>{stats.wins}</b></span><span>Losses <b>{stats.losses}</b></span><span>Failed <b>{stats.failed}</b></span></div>
                </div>}
            </section>
        </main>
        {bulk_trade.is_confirmation_open && <ConfirmationDialog />}
    </div>;
});

export default BulkTrade;
