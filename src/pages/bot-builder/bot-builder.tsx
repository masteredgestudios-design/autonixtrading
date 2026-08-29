// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { botNotification } from '@/components/bot-notification/bot-notification';
import { notification_message } from '@/components/bot-notification/bot-notification-utils';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { TBlocklyEvents } from 'Types';
import LoadModal from '../../components/load-modal';
import SaveModal from '../dashboard/bot-list/save-modal';
import BotBuilderTourHandler from '../tutorials/dbot-tours/bot-builder-tour';
import QuickStrategy1 from './quick-strategy';
import WorkspaceWrapper from './workspace-wrapper';

const BotBuilder = observer(() => {
    const { dashboard, app, run_panel, toolbar, quick_strategy, blockly_store } = useStore();
    const { active_tab, active_tour, is_preview_on_popup } = dashboard;
    const { is_open } = quick_strategy;
    const { is_running } = run_panel;
    const { is_loading } = blockly_store;
    const is_blockly_listener_registered = React.useRef(false);
    const is_blockly_delete_listener_registered = React.useRef(false);
    const deleted_block_id_ref = React.useRef<string | null>(null);
    const { isDesktop } = useDevice();
    const { onMount, onUnmount } = app;
    const el_ref = React.useRef<HTMLInputElement | null>(null);

    // TODO: fix
    // const isMounted = useIsMounted();
    // const { data: remote_config_data } = useRemoteConfig(isMounted());

    React.useEffect(() => {
        onMount();
        return () => onUnmount();
    }, [onMount, onUnmount]);

    const handleBlockChangeOnBotRun = React.useCallback(
        (e: Event) => {
            const workspace = window.Blockly?.derivWorkspace;
            if (!workspace || workspace.isDisposed?.()) {
                is_blockly_listener_registered.current = false;
                return;
            }

            const { is_reset_button_clicked } = toolbar;
            if (e.type !== 'selected' && !is_reset_button_clicked) {
                botNotification(notification_message().workspace_change);
                is_blockly_listener_registered.current = false;
                workspace.removeChangeListener(handleBlockChangeOnBotRun);
            } else if (is_reset_button_clicked) {
                is_blockly_listener_registered.current = false;
                workspace.removeChangeListener(handleBlockChangeOnBotRun);
            }
        },
        [toolbar]
    );

    const removeBlockChangeListener = React.useCallback(() => {
        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace || !is_blockly_listener_registered.current) return;

        workspace.removeChangeListener(handleBlockChangeOnBotRun);
        is_blockly_listener_registered.current = false;
    }, [handleBlockChangeOnBotRun]);

    React.useEffect(() => {
        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace || workspace.isDisposed?.()) return;

        if (is_running) {
            if (!is_blockly_listener_registered.current) {
                is_blockly_listener_registered.current = true;
                workspace.addChangeListener(handleBlockChangeOnBotRun);
            }
        } else {
            removeBlockChangeListener();
        }

        return () => {
            removeBlockChangeListener();
        };
    }, [handleBlockChangeOnBotRun, is_running, removeBlockChangeListener]);

    const handleBlockDelete = React.useCallback(
        (e: TBlocklyEvents) => {
            const { is_reset_button_clicked, setResetButtonState } = toolbar;
            const workspace = window.Blockly?.derivWorkspace;
            if (!workspace || workspace.isDisposed?.()) {
                is_blockly_delete_listener_registered.current = false;
                return;
            }

            if (e.type === 'undo') {
                deleted_block_id_ref.current = null;
                return;
            }
            if (e.type === 'delete' && !is_reset_button_clicked) {
                deleted_block_id_ref.current = e.blockId;
            }
            if (e.type === 'selected' && deleted_block_id_ref.current === e.oldElementId) {
                handleBlockDeleteNotification();
                deleted_block_id_ref.current = null;
            }
            if (
                e.type === 'change' &&
                e.name === 'AMOUNT_LIMITS' &&
                e.newValue === '(min: 0.35 - max: 50000)' &&
                is_reset_button_clicked
            ) {
                setResetButtonState(false);
            }
        },
        [toolbar]
    );

    React.useEffect(() => {
        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace || workspace.isDisposed?.()) return;

        if (!is_blockly_delete_listener_registered.current) {
            is_blockly_delete_listener_registered.current = true;
            workspace.addChangeListener(handleBlockDelete);
        }

        return () => {
            if (workspace && is_blockly_delete_listener_registered.current) {
                workspace.removeChangeListener(handleBlockDelete);
                is_blockly_delete_listener_registered.current = false;
            }
        };
    }, [handleBlockDelete, is_loading]);

    const handleBlockDeleteNotification = React.useCallback(() => {
        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace || workspace.isDisposed?.()) return;

        botNotification(notification_message().block_delete, {
            label: localize('Undo'),
            onClick: closeToast => {
                if (!window.Blockly?.derivWorkspace || window.Blockly.derivWorkspace.isDisposed?.()) {
                    closeToast?.();
                    return;
                }
                window.Blockly.derivWorkspace.undo?.();
                closeToast?.();
            },
        });
    }, []);

    return (
        <>
            <div
                className={classNames('bot-builder', {
                    'bot-builder--active': active_tab === 1 && !is_preview_on_popup,
                    'bot-builder--inactive': is_preview_on_popup,
                    'bot-builder--tour-active': active_tour,
                })}
            >
                <div id='scratch_div' ref={el_ref}>
                    <WorkspaceWrapper />
                </div>
            </div>
            {active_tab === 1 && <BotBuilderTourHandler is_mobile={!isDesktop} />}
            {/* removed this outside from toolbar becuase it needs to loaded seperately without dependency */}
            <LoadModal />
            <SaveModal />
            {is_open && <QuickStrategy1 />}
        </>
    );
});

export default BotBuilder;
