import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useCurrency } from '@/contexts/currency-context';
import { botNotification } from '@/components/bot-notification/bot-notification';
import BulkTradeExecutor from '@/services/bulk-trade-executor';
import './confirmation-dialog.scss';

const ConfirmationDialog = observer(() => {
    const { bulk_trade } = useStore();
    const { formatMoney } = useCurrency();
    const [isProcessing, setIsProcessing] = React.useState(false);

    const config = bulk_trade.config;
    const displayStake = formatMoney(config.stake);

    const handleConfirm = async () => {
        setIsProcessing(true);
        try {
            // Start the batch
            bulk_trade.startBatch();
            
            // Get the current batch
            const batch = bulk_trade.current_batch;
            if (!batch) {
                throw new Error('Failed to create batch');
            }

            // Execute the batch
            const executor = new BulkTradeExecutor(bulk_trade);
            await executor.executeBatch(batch);
            
            botNotification('Bulk trade batch submitted successfully!', undefined, { type: 'success' });
        } catch (error: any) {
            botNotification(error.message || 'Failed to submit bulk trade', undefined, { type: 'error' });
            // Reset the batch on error
            bulk_trade.clearBatches();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancel = () => {
        bulk_trade.closeConfirmation();
    };

    return (
        <div className='confirmation-overlay'>
            <div className='confirmation-dialog'>
                <div className='dialog-header'>
                    <h2>Confirm Bulk Trade</h2>
                </div>

                <div className='dialog-content'>
                    <div className='config-summary'>
                        <div className='summary-item'>
                            <span className='label'>Symbol</span>
                            <span className='value'>{config.symbol}</span>
                        </div>

                        <div className='summary-item'>
                            <span className='label'>Trade Type</span>
                            <span className='value'>
                                {config.trade_type === 'even_odd' && 'Even/Odd'}
                                {config.trade_type === 'over_under' && 'Over/Under'}
                                {config.trade_type === 'rise_fall' && 'Rise/Fall'}
                                {config.trade_type === 'differs' && 'Differs'}
                            </span>
                        </div>

                        <div className='summary-item'>
                            <span className='label'>Direction</span>
                            <span className='value'>
                                {config.direction.charAt(0).toUpperCase() + config.direction.slice(1)}
                                {config.digit !== undefined && ` ${config.digit}`}
                            </span>
                        </div>

                        <div className='summary-item'>
                            <span className='label'>Duration</span>
                            <span className='value'>{config.duration}</span>
                        </div>

                        <div className='summary-divider' />

                        <div className='summary-item'>
                            <span className='label'>Stake per Trade</span>
                            <span className='value'>{displayStake}</span>
                        </div>

                        <div className='summary-item'>
                            <span className='label'>Number of Trades</span>
                            <span className='value'>{config.num_trades}</span>
                        </div>

                    </div>
                </div>

                <div className='dialog-actions'>
                    <button 
                        className='btn-cancel'
                        onClick={handleCancel}
                        disabled={isProcessing}
                    >
                        Cancel
                    </button>
                    <button 
                        className='btn-confirm'
                        onClick={handleConfirm}
                        disabled={isProcessing}
                    >
                        {isProcessing ? 'Processing...' : 'Confirm & Start'}
                    </button>
                </div>
            </div>
        </div>
    );
});

export default ConfirmationDialog;
