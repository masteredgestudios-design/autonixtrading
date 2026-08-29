// Removed unused React import - React 17+ JSX transform doesn't require it
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import Button from '../shared_ui/button';

const RecentFooter = observer(() => {
    const { load_modal, dashboard } = useStore();
    const {
        is_open_button_loading,
        is_open_button_disabled,
        loadStrategyOnBotBuilder,
        toggleLoadModal,
    } = load_modal;

    return (
        <Button
            text={localize('Open')}
            onClick={async () => {
                try {
                    const opened = await loadStrategyOnBotBuilder();
                    if (!opened) throw new Error('The saved strategy could not be opened.');
                    toggleLoadModal();
                } catch (error) {
                    console.error(error);
                }
            }}
            is_loading={is_open_button_loading}
            has_effect
            primary
            large
            disabled={is_open_button_disabled}
        />
    );
});

export default RecentFooter;
