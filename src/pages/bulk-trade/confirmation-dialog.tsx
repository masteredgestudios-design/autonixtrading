import React from 'react';
import { observer } from 'mobx-react-lite';
import { useCurrency } from '@/contexts/currency-context';
import { useStore } from '@/hooks/useStore';
import BulkTradeExecutor from '@/services/bulk-trade-executor';
import './confirmation-dialog.scss';

const ConfirmationDialog = observer(() => {
    const { bulk_trade } = useStore();
    const { run_panel } = useStore();
    const { formatMoney } = useCurrency();
    const executor = React.useRef<BulkTradeExecutor>();
    const config = bulk_trade.config;
    const start = async () => { const batch = bulk_trade.startBatch(); if (!batch) return; run_panel.toggleDrawer(true); executor.current = new BulkTradeExecutor(bulk_trade); try { await executor.current.execute(batch); } catch (error: any) { bulk_trade.finishBatch(); alert(error?.message || 'Unable to start bulk trade.'); } };
    React.useEffect(() => () => executor.current?.cleanup(), []);
    return <div className='bulk-confirmation__overlay' role='dialog' aria-modal='true'>
        <div className='bulk-confirmation'>
            <h2>Confirm Bulk Trade</h2>
            <dl><dt>Symbol</dt><dd>{config.symbol}</dd><dt>Trade Type</dt><dd>{config.trade_type.replace('_', ' / ')}</dd><dt>Direction</dt><dd>{config.direction}{config.digit !== undefined ? ` ${config.digit}` : ''}</dd><dt>Duration</dt><dd>{config.duration}</dd><dt>Stake per Trade</dt><dd>{formatMoney(config.stake_usd)}</dd><dt>Number of Trades</dt><dd>{config.number_of_trades}</dd></dl>
            <div className='bulk-confirmation__actions'><button type='button' onClick={bulk_trade.closeConfirmation} disabled={bulk_trade.is_executing}>Cancel</button><button type='button' onClick={start} disabled={bulk_trade.is_executing}>{bulk_trade.is_executing ? 'Submitting...' : 'Confirm & Start'}</button></div>
        </div>
    </div>;
});
export default ConfirmationDialog;
