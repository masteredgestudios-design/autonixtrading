import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportNewBotButton from '../import-new-bot-button';
import { loadXmlIntoWorkspace } from '@/external/bot-skeleton/scratch/utils';

const mockClick = jest.fn();
const mockLoad = loadXmlIntoWorkspace as jest.Mock;

jest.mock('@/external/bot-skeleton/scratch/utils', () => ({
    loadXmlIntoWorkspace: jest.fn(),
}));

jest.mock('@/components/bot-notification/bot-notification', () => ({
    botNotification: jest.fn(),
}));

jest.mock('@/components/bot-notification/bot-notification-utils', () => ({
    notification_message: () => ({ xml_import_error: 'Unable to import bot' }),
}));

jest.mock('@deriv-com/translations', () => ({
    localize: (value: string) => value,
}));

jest.mock('@deriv/quill-icons/LabelPaired', () => ({
    LabelPairedFolderOpenMdRegularIcon: () => <span />,
}));

jest.mock('../toolbar-icon', () => ({ children, icon }: { children?: React.ReactNode; icon: React.ReactNode }) => (
    <div onClick={mockClick}>{icon}{children}</div>
));

const validXml = '<xml><block type="trade_definition" id="main" /></xml>';

describe('ImportNewBotButton', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.Blockly = {
            Blocks: { trade_definition: {} },
            utils: { xml: { textToDom: (value: string) => new DOMParser().parseFromString(value, 'text/xml') } },
            derivWorkspace: { isDisposed: () => false },
        } as any;
        mockLoad.mockImplementation(() => undefined);
    });

    it('loads selected XML into the current workspace without using the load modal', async () => {
        render(<ImportNewBotButton />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File([validXml], 'bot.xml', { type: 'application/xml' });

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
        expect(mockLoad.mock.calls[0][1]).toBe(window.Blockly.derivWorkspace);
    });
});
