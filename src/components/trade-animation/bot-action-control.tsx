import { observer } from 'mobx-react-lite';
import { LabelPairedPlayLgFillIcon, LabelPairedSquareLgFillIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import { useStore } from '@/hooks/useStore';
import './bot-action-control.scss';

type TBotActionControl = {
    is_run_disabled?: boolean;
};

const BotActionControl = observer(({ is_run_disabled = false }: TBotActionControl) => {
    const { run_panel } = useStore();
    const { has_open_contract, is_running, is_stop_button_disabled, stopBot, onRunButtonClick } = run_panel;
    const is_stopping = is_stop_button_disabled;
    const is_active = is_running || has_open_contract;

    return (
        <div className='bot-action-control-group'>
            {is_active ? (
                <>
                    <button type='button' className='bot-action-control bot-action-control--running' disabled>
                        <span className='bot-action-control__pulse' />
                        <span>{localize('Running')}</span>
                    </button>
                    <button
                        type='button'
                        id='db-animation__stop-button'
                        className='bot-action-control bot-action-control--stop'
                        disabled={is_stopping}
                        onClick={() => void stopBot()}
                        aria-label={localize('Stop bot')}
                    >
                        <LabelPairedSquareLgFillIcon fill='currentColor' />
                        <span>{is_stopping ? localize('Stopping') : localize('Stop Bot')}</span>
                    </button>
                </>
            ) : (
                <button
                    type='button'
                    id='db-animation__run-button'
                    className='bot-action-control bot-action-control--run'
                    disabled={is_run_disabled}
                    onClick={onRunButtonClick}
                    aria-label={localize('Run bot')}
                >
                    <LabelPairedPlayLgFillIcon fill='currentColor' />
                    <span>{localize('Run Bot')}</span>
                </button>
            )}
        </div>
    );
});

export default BotActionControl;