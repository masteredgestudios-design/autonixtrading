import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import BulkTradeConfiguration from './bulk-trade-configuration';
import RunPanel, { DrawerContent } from '@/components/run-panel/run-panel';
import ConfirmationDialog from './confirmation-dialog';
import './bulk-trade.scss';

const sharedBulkTradeDrawerSurface = (
    <DrawerContent
        active_index={0}
        active_tour=''
        is_drawer_open={false}
        is_mobile={false}
        lost_contracts={0}
        number_of_runs={0}
        setActiveTabIndex={() => undefined}
        toggleStatisticsInfoModal={() => undefined}
        total_payout={0}
        total_profit={0}
        total_stake={0}
        won_contracts={0}
        is_embedded
    />
);

void sharedBulkTradeDrawerSurface;

const BulkTrade = observer(() => {
    const { bulk_trade } = useStore();
    const { isDesktop } = useDevice();

    return (
        <div className={classNames('bulk-trade-wrapper', { 'bulk-trade-wrapper--mobile': !isDesktop })}>
            <div className='bulk-trade-header'>
                <div className='header-content'>
                    <h1 className='header-title'>Bulk Trade</h1>
                    <p className='header-subtitle'>Configure and submit multiple identical contracts simultaneously</p>
                </div>
            </div>

            <div className='bulk-trade-container'>
                <div className='bulk-trade-main'>
                    <div className='configuration-card'>
                        <BulkTradeConfiguration />
                    </div>
                </div>

                {isDesktop && (
                    <div className='bulk-trade-journal-section'>
                        <RunPanel is_embedded />
                    </div>
                )}
            </div>

            {!isDesktop && <RunPanel is_embedded />}

            {bulk_trade.is_confirmation_open && (
                <ConfirmationDialog />
            )}
        </div>
    );
});

export default BulkTrade;
