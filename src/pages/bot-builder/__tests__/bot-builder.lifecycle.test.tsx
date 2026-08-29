import React from 'react';
import { render } from '@testing-library/react';
import BotBuilder from '../bot-builder';

const mockStore = {
    dashboard: {
        active_tab: 1,
        active_tour: false,
        is_preview_on_popup: false,
    },
    app: {
        onMount: jest.fn(),
        onUnmount: jest.fn(),
    },
    run_panel: {
        is_running: false,
    },
    toolbar: {
        is_reset_button_clicked: false,
        setResetButtonState: jest.fn(),
    },
    quick_strategy: {
        is_open: false,
    },
    blockly_store: {
        is_loading: false,
    },
};

jest.mock('@/hooks/useStore', () => ({
    useStore: () => mockStore,
}));

jest.mock('@/components/bot-notification/bot-notification', () => ({
    botNotification: jest.fn(),
}));

jest.mock('../../../components/load-modal/load-modal', () => () => null);
jest.mock('../../dashboard/bot-list/save-modal', () => () => null);
jest.mock('../../tutorials/dbot-tours/bot-builder-tour', () => () => null);
jest.mock('../quick-strategy', () => () => null);
jest.mock('../workspace-wrapper', () => () => null);

beforeEach(() => {
    jest.clearAllMocks();

    const workspace = {
        addChangeListener: jest.fn(),
        removeChangeListener: jest.fn(),
        undo: jest.fn(),
        isDisposed: jest.fn(() => false),
    };

    window.Blockly = {
        derivWorkspace: workspace,
    } as any;
});

describe('BotBuilder lifecycle', () => {
    it('removes the block delete listener when the builder unmounts', () => {
        const { unmount } = render(<BotBuilder />);

        expect(window.Blockly.derivWorkspace.addChangeListener).toHaveBeenCalled();
        unmount();

        expect(window.Blockly.derivWorkspace.removeChangeListener).toHaveBeenCalledWith(expect.any(Function));
    });
});
