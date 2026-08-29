import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { botNotification } from '../bot-notification/bot-notification';
import { notification_message } from '../bot-notification/bot-notification-utils';
import Button from '../shared_ui/button';

const LocalFooter = observer(() => {
    const { load_modal, dashboard } = useStore();
    const {
        is_open_button_loading,
        is_open_button_disabled,
        loadStrategyOnBotBuilder,
        disposeLocalWorkspace,
        setLoadedLocalFile,
        saveStrategyToLocalStorage,
        toggleLoadModal,
    } = load_modal;
    const { setPreviewOnPopup } = dashboard;
    const { isDesktop } = useDevice();
    const Wrapper = isDesktop ? React.Fragment : Button.Group;

    return (
        <Wrapper>
            {!isDesktop && (
                <Button text={localize('Cancel')} onClick={() => setLoadedLocalFile(null)} has_effect secondary large />
            )}
            <Button
                text={localize('Open')}
                onClick={async () => {
                        try {
                            const opened = await loadStrategyOnBotBuilder();
                            if (!opened) throw new Error('The imported strategy could not be opened.');
                            await saveStrategyToLocalStorage();
                            setLoadedLocalFile(null);
                            toggleLoadModal();
                            setPreviewOnPopup(false);
                            botNotification(notification_message().BOT_IMPORT);
                        } catch (error) {
                            console.error(error);
                            botNotification(notification_message().xml_import_error, undefined, {
                                className: 'error-toast',
                            });
                        }
                }}
                is_loading={is_open_button_loading}
                has_effect
                primary
                large
                disabled={is_open_button_disabled}
            />
        </Wrapper>
    );
});

export default LocalFooter;
