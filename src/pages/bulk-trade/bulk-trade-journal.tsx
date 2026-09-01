import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useCurrency } from '@/contexts/currency-context';
import './bulk-trade-journal.scss';

const BulkTradeJournal = observer(() => {
    const { bulk_trade } = useStore();
    const { formatMoney, fromUsd } = useCurrency();

    if (bulk_trade.batches.length === 0) {
        return (
            <div className='bulk-trade-journal'>
                <h2 className='journal-title'>Bulk Trade Journal</h2>
                <div className='journal-empty'>
                    <p>No bulk trades yet. Start your first bulk trade to see results here.</p>
                </div>
            </div>
        );
    }

    // Show current batch first, then history
    const sortedBatches = [...bulk_trade.batches].sort((a, b) => b.created_at - a.created_at);

    return (
        <div className='bulk-trade-journal'>
            <h2 className='journal-title'>Bulk Trade Journal</h2>

            <div className='journal-batches'>
                {sortedBatches.map((batch) => {
                    const stats = {
                        wins: batch.contracts.filter(c => c.status === 'won').length,
                        losses: batch.contracts.filter(c => c.status === 'lost').length,
                        failed: batch.contracts.filter(c => c.status === 'failed').length,
                        completed: batch.contracts.filter(c => ['won', 'lost'].includes(c.status)).length,
                    };

                    const totalProfit = batch.contracts.reduce((sum, c) => sum + (c.profit || 0), 0);
                                    const displayProfit = formatMoney(totalProfit);
                    return (
                        <div key={batch.batch_id} className='batch-card'>
                            <div className='batch-header'>
                                <div className='batch-id'>Batch #{batch.batch_id.split('_')[1]}</div>
                                <div className={`batch-status ${batch.status}`}>
                                    {batch.status.toUpperCase()}
                                </div>
                            </div>

                            <div className='batch-info-grid'>
                                <div className='info-item'>
                                    <span className='info-label'>Symbol</span>
                                    <span className='info-value'>{batch.config.symbol}</span>
                                </div>
                                <div className='info-item'>
                                    <span className='info-label'>Trade Type</span>
                                    <span className='info-value'>
                                        {batch.config.trade_type === 'even_odd' && 'Even/Odd'}
                                        {batch.config.trade_type === 'over_under' && 'Over/Under'}
                                        {batch.config.trade_type === 'rise_fall' && 'Rise/Fall'}
                                        {batch.config.trade_type === 'differs' && 'Differs'}
                                    </span>
                                </div>
                                <div className='info-item'>
                                    <span className='info-label'>Direction</span>
                                    <span className='info-value'>
                                        {batch.config.direction.charAt(0).toUpperCase() + batch.config.direction.slice(1)}
                                        {batch.config.digit !== undefined && ` ${batch.config.digit}`}
                                    </span>
                                </div>
                                <div className='info-item'>
                                    <span className='info-label'>Duration</span>
                                    <span className='info-value'>{batch.config.duration}</span>
                                </div>
                            </div>

                            <div className='batch-stats-grid'>
                                <div className='stat-item'>
                                    <span className='stat-label'>Total Trades</span>
                                    <span className='stat-value'>{batch.contracts.length}</span>
                                </div>
                                <div className='stat-item'>
                                    <span className='stat-label'>Completed</span>
                                    <span className='stat-value'>{stats.completed}</span>
                                </div>
                                <div className='stat-item'>
                                    <span className='stat-label'>Wins</span>
                                    <span className='stat-value wins'>{stats.wins}</span>
                                </div>
                                <div className='stat-item'>
                                    <span className='stat-label'>Losses</span>
                                    <span className='stat-value losses'>{stats.losses}</span>
                                </div>
                                <div className='stat-item'>
                                    <span className='stat-label'>Failed</span>
                                    <span className='stat-value failed'>{stats.failed}</span>
                                </div>
                                <div className='stat-item'>
                                    <span className='stat-label'>Profit/Loss</span>
                                    <span className={`stat-value ${totalProfit >= 0 ? 'profit' : 'loss'}`}>
                                        {displayProfit}
                                    </span>
                                </div>
                            </div>

                            {/* Individual Contracts */}
                            {batch.contracts.length > 0 && (
                                <div className='batch-contracts'>
                                    <div className='contracts-header'>
                                        <span className='col-index'>#</span>
                                        <span className='col-trade'>Trade</span>
                                        <span className='col-status'>Status</span>
                                        <span className='col-result'>Result</span>
                                    </div>
                                    {batch.contracts.map((contract) => {
                                        const displayResult = contract.profit !== undefined 
                                            ? formatMoney(contract.profit)
                                            : '-';

                                        return (
                                            <div key={contract.contract_index} className='contract-row'>
                                                <span className='col-index'>#{contract.contract_index}</span>
                                                <span className='col-trade'>
                                                    {batch.config.direction.charAt(0).toUpperCase() + batch.config.direction.slice(1)}
                                                    {batch.config.digit !== undefined && ` ${batch.config.digit}`}
                                                </span>
                                                <span className={`col-status status-${contract.status}`}>
                                                    {contract.status.toUpperCase()}
                                                </span>
                                                <span className={`col-result ${contract.profit && contract.profit >= 0 ? 'profit' : 'loss'}`}>
                                                    {displayResult}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

export default BulkTradeJournal;
