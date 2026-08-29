import React from 'react';
import { botNotification } from '@/components/bot-notification/bot-notification';
import { notification_message } from '@/components/bot-notification/bot-notification-utils';
import { loadXmlIntoWorkspace } from '@/external/bot-skeleton/scratch/utils';
import { localize } from '@deriv-com/translations';
import { LabelPairedFolderOpenMdRegularIcon } from '@deriv/quill-icons/LabelPaired';
import ToolbarIcon from './toolbar-icon';

const import_error = () =>
    botNotification(notification_message().xml_import_error, undefined, { className: 'error-toast' });

const parseAndValidateXml = (value: string) => {
    const document = new DOMParser().parseFromString(value, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) {
        throw new Error('Invalid Blockly XML.');
    }

    const xml = window.Blockly?.utils?.xml?.textToDom(value);
    const blocks = xml?.querySelectorAll('block');
    if (!xml || !blocks?.length) {
        throw new Error('The XML file does not contain Blockly blocks.');
    }

    const unsupported_blocks = Array.from(blocks)
        .map(block => block.getAttribute('type'))
        .filter(block_type => !block_type || !Object.prototype.hasOwnProperty.call(window.Blockly.Blocks, block_type));

    if (unsupported_blocks.length) {
        throw new Error(`Unsupported Blockly blocks: ${unsupported_blocks.join(', ')}`);
    }

    return xml;
};

const ImportNewBotButton = () => {
    const file_input_ref = React.useRef<HTMLInputElement>(null);
    const [is_loading, setIsLoading] = React.useState(false);

    const importFile = (file: File) => {
        if (!file.name.toLowerCase().endsWith('.xml')) {
            import_error();
            return;
        }

        const reader = new FileReader();
        setIsLoading(true);
        reader.onload = event => {
            const workspace = window.Blockly?.derivWorkspace;
            const value = event.target?.result;

            try {
                if (typeof value !== 'string') throw new Error('The XML file could not be read.');
                if (!workspace || (workspace as any).isDisposed?.()) throw new Error('Blockly is not ready.');

                const xml = parseAndValidateXml(value);
                loadXmlIntoWorkspace(xml, workspace);
            } catch (error) {
                console.error('[Import New Bot] Import failed', error);
                import_error();
            } finally {
                setIsLoading(false);
            }
        };
        reader.onerror = () => {
            import_error();
            setIsLoading(false);
        };
        reader.readAsText(file);
    };

    const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) importFile(file);
    };

    return (
        <>
            <input
                ref={file_input_ref}
                type='file'
                accept='.xml,application/xml,text/xml'
                hidden
                onChange={onFileChange}
            />
            <ToolbarIcon
                popover_message={localize('Import New Bot')}
                icon={
                    <span
                        className='toolbar__icon'
                        id='db-toolbar__import-button'
                        data-testid='dt_toolbar_import_new_bot_button'
                        aria-label={localize('Import New Bot')}
                        aria-busy={is_loading}
                        onClick={() => file_input_ref.current?.click()}
                    >
                        <LabelPairedFolderOpenMdRegularIcon />
                    </span>
                }
            />
        </>
    );
};

export default ImportNewBotButton;