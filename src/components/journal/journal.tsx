// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classnames from 'classnames';
import { observer } from 'mobx-react-lite';
import { contract_stages } from '@/constants/contract-stage';
import { useStore } from '@/hooks/useStore';
import { LabelPairedBarsFilterCaptionFillIcon } from '@deriv/quill-icons/LabelPaired';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { TCheckedFilters, TFilterMessageValues } from './journal.types';
import { JournalItem, JournalLoader } from './journal-components';
import FilterDialog from './journal-components/filter-dialog';
import Download from '../download';

const Journal = observer(() => {
    const { journal, run_panel } = useStore();
    const {
        checked_filters,
        filterMessage,
        filters,
        filtered_messages,
        is_filter_dialog_visible,
        toggleFilterDialog,
        unfiltered_messages,
    } = journal;
    const { is_stop_button_visible, contract_stage } = run_panel;

    const safe_filtered_messages = Array.isArray(filtered_messages) ? filtered_messages : [];
    const safe_unfiltered_messages = Array.isArray(unfiltered_messages) ? unfiltered_messages : [];
    const filtered_messages_length = safe_filtered_messages.length;
    const unfiltered_messages_length = safe_unfiltered_messages.length;
    const { isDesktop } = useDevice();
    const filter_button_ref = React.useRef<HTMLButtonElement>(null);

    return (
        <div
            className={classnames('journal run-panel-tab__content--no-stat', {
                'run-panel-tab__content': isDesktop,
            })}
            data-testid='dt_mock_journal'
        >
            <div className='journal__header'>
                <div>
                    <span className='journal__eyebrow'><Localize i18n_default_text='Bot activity' /></span>
                    <strong>{is_stop_button_visible ? localize('Trading in progress') : localize('Bot is not running')}</strong>
                </div>
                <div className='journal__actions'>
                    <Download tab='journal' />
                    <button ref={filter_button_ref} type='button' className='journal__icon-button' onClick={toggleFilterDialog} aria-label={localize('Filter journal')}>
                        <LabelPairedBarsFilterCaptionFillIcon height='16px' width='16px' fill='currentColor' />
                    </button>
                </div>
            </div>
            {is_filter_dialog_visible && (
                <FilterDialog
                    toggle_ref={filter_button_ref}
                    checked_filters={checked_filters}
                    filters={filters}
                    filterMessage={filterMessage}
                    is_filter_dialog_visible={is_filter_dialog_visible}
                    toggleFilterDialog={toggleFilterDialog}
                />
            )}
            <div className='journal__item-list journal__item-list--new'>
                {filtered_messages_length ? (
                    <div className='journal__feed'>
                        {safe_filtered_messages.map((row: TFilterMessageValues) => (
                            <JournalItem key={row.unique_id} row={row} measure={() => undefined} />
                        ))}
                    </div>
                ) : (
                    <>
                        {contract_stage >= contract_stages.STARTING &&
                        !!Object.keys(checked_filters as TCheckedFilters).length &&
                        !unfiltered_messages_length &&
                        is_stop_button_visible ? (
                            <JournalLoader is_mobile={!isDesktop} />
                        ) : (
                            <div className='journal-empty journal-empty--new'>
                                <span className='journal-empty__status-dot' />
                                <strong><Localize i18n_default_text='No activity yet' /></strong>
                                <p><Localize i18n_default_text='Run the bot to see trading events and system messages here.' /></p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
});

export default Journal;
