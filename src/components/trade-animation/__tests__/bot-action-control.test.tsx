import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BotActionControl from '../bot-action-control';

const mockRun = jest.fn();
const mockStop = jest.fn();
let mockRunPanel = {
    has_open_contract: false,
    is_running: false,
    is_stop_button_disabled: false,
    onRunButtonClick: mockRun,
    stopBot: mockStop,
};

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({ run_panel: mockRunPanel }),
}));

jest.mock('@deriv-com/translations', () => ({
    localize: (value: string) => value,
}));

jest.mock('@deriv/quill-icons/LabelPaired', () => ({
    LabelPairedPlayLgFillIcon: () => <span data-testid='play-icon' />,
    LabelPairedSquareLgFillIcon: () => <span data-testid='stop-icon' />,
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockRunPanel = {
        has_open_contract: false,
        is_running: false,
        is_stop_button_disabled: false,
        onRunButtonClick: mockRun,
        stopBot: mockStop,
    };
});

describe('BotActionControl', () => {
    it('shows only Run Bot before the bot starts', () => {
        render(<BotActionControl />);

        expect(screen.getByRole('button', { name: 'Run bot' })).toHaveTextContent('Run Bot');
        expect(screen.queryByRole('button', { name: 'Stop bot' })).not.toBeInTheDocument();
    });

    it('shows independent Running and Stop Bot controls while trading', () => {
        mockRunPanel = { ...mockRunPanel, is_running: true };
        render(<BotActionControl />);

        expect(screen.getByRole('button', { name: 'Stop bot' })).toHaveTextContent('Stop Bot');
        expect(screen.getByRole('button', { name: 'Stop bot' })).not.toBeDisabled();
        expect(screen.getByRole('button', { name: 'Running' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Stop bot' }));
        expect(mockStop).toHaveBeenCalledTimes(1);
    });
});
