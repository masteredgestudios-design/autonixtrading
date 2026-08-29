import React from 'react';
import { render, screen } from '@testing-library/react';
import Journal from '../journal';

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        journal: {
            checked_filters: ['error', 'notify', 'success'],
            filterMessage: jest.fn(),
            filters: [],
            filtered_messages: [],
            is_filter_dialog_visible: false,
            toggleFilterDialog: jest.fn(),
            unfiltered_messages: [],
        },
        run_panel: {
            contract_stage: 0,
            is_stop_button_visible: false,
        },
    }),
}));

jest.mock('@deriv-com/ui', () => ({
    useDevice: () => ({ isDesktop: true }),
}));

jest.mock('@deriv-com/translations', () => ({
    Localize: ({ i18n_default_text }: { i18n_default_text: string }) => <>{i18n_default_text}</>,
    localize: (value: string) => value,
}));

jest.mock('@deriv/quill-icons/LabelPaired', () => ({
    LabelPairedBarsFilterCaptionFillIcon: () => <span data-testid='filter-icon' />,
}));

jest.mock('../../download', () => () => <span data-testid='download-control' />);
jest.mock('../journal-components', () => ({
    JournalItem: () => null,
    JournalLoader: () => null,
}));
jest.mock('../journal-components/filter-dialog', () => () => null);

describe('Journal empty state', () => {
    it('renders safely when the bot is stopped and there are no entries', () => {
        render(<Journal />);

        expect(screen.getByText('Bot is not running')).toBeInTheDocument();
        expect(screen.getByText('No activity yet')).toBeInTheDocument();
        expect(screen.getByText('Run the bot to see execution events here.')).toBeInTheDocument();
    });
});
