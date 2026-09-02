import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Cards from '../cards';

const mockSetActiveTab = jest.fn();
const mockLoad = jest.fn();

const mockBot = {
    id: 'bot-1',
    name: 'Bot One',
    description: 'Example bot.',
    strategy_type: 'Upside/Downside',
    market: 'Synthetic Index',
    symbol: '1HZ10V',
    file_name: 'bot-one.xml',
    xml: '<xml><block type="trade_definition"/></xml>',
};

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        dashboard: {
            setActiveTab: mockSetActiveTab,
        },
    }),
}));

jest.mock('@/external/bot-skeleton/scratch', () => ({
    load: (...args: any[]) => mockLoad(...args),
}));

jest.mock('@/utils/xml-bot-store', () => ({
    getXmlBotStoreCatalog: jest.fn(async () => [mockBot]),
}));

describe('Dashboard XML bot cards', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as any).window.Blockly = {
            derivWorkspace: {
                isDisposed: jest.fn(() => false),
                strategy_to_load: '',
                current_strategy_id: '',
            },
        };
    });

    it('prevents duplicate loads when the same bot is clicked rapidly', async () => {
        mockLoad.mockResolvedValue({});

        render(<Cards has_dashboard_strategies={false} is_mobile={false} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Load Bot/i })).toBeInTheDocument());

        const button = screen.getByRole('button', { name: /Load Bot/i });
        fireEvent.click(button);
        fireEvent.click(button);

        await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
        expect(mockLoad).toHaveBeenCalledWith(
            expect.objectContaining({
                strategy_id: 'bot-1',
                show_snackbar: false,
            })
        );
    });
});
