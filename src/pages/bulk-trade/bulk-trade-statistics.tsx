import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useCurrency } from '@/contexts/currency-context';
import './bulk-trade-statistics.scss';

const BulkTradeStatistics = observer(() => {
    const { bulk_trade } = useStore();
    const { formatMoney, fromUsd } = useCurrency();
    const stats = bulk_trade.batch_statistics;

    const displayCurrentPnL = formatMoney(stats.current_pnl);
    const displayTotalPayout = formatMoney(stats.total_payout);

    return (
        <div className='bulk-trade-statistics'>
            <h2 className='statistics-title'>Live Statistics</h2>

            <div className='statistics-grid'>
                <div className='stat-card'>
                    <div className='stat-label'>Total Trades</div>
                    <div className='stat-value'>{stats.total_contracts}</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Submitted</div>
                    <div className='stat-value'>{stats.submitted}</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Completed</div>
                    <div className='stat-value'>{stats.completed}</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Pending</div>
                    <div className='stat-value'>{stats.pending}</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Wins</div>
                    <div className='stat-value wins'>{stats.won}</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Losses</div>
                    <div className='stat-value losses'>{stats.lost}</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Failed</div>
                    <div className='stat-value failed'>{stats.failed}</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Win Rate</div>
                    <div className='stat-value'>{stats.win_rate.toFixed(2)}%</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Total Payout</div>
                    <div className='stat-value'>{displayTotalPayout}</div>
                </div>

                <div className='stat-card'>
                    <div className='stat-label'>Profit/Loss</div>
                    <div className={`stat-value ${stats.current_pnl >= 0 ? 'profit' : 'loss'}`}>
                        {displayCurrentPnL}
                    </div>
                </div>

                <div className='stat-card status'>
                    <div className='stat-label'>Status</div>
                    <div className='stat-value'>{bulk_trade.is_executing ? 'Running' : 'Ready'}</div>
                </div>
            </div>

            {/* Progress Bar */}
            {stats.total_contracts > 0 && (
                <div className='progress-section'>
                    <div className='progress-label'>
                        Progress: {stats.completed} / {stats.total_contracts}
                    </div>
                    <div className='progress-bar'>
                        <div 
                            className='progress-fill'
                            style={{ width: `${(stats.completed / stats.total_contracts) * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
});

export default BulkTradeStatistics;
