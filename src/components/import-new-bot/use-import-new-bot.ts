import React from 'react';
import { botNotification } from '@/components/bot-notification/bot-notification';
import { notification_message } from '@/components/bot-notification/bot-notification-utils';
import { loadXmlIntoWorkspace } from '@/external/bot-skeleton/scratch/utils';

const show_import_error = () =>
    botNotification(notification_message().xml_import_error, undefined, { className: 'error-toast' });

const parseAndValidateXml = (value: string) => {
    const document = new DOMParser().parseFromString(value, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid Blockly XML.');

    const xml = window.Blockly?.utils?.xml?.textToDom(value);
    const blocks = xml?.querySelectorAll('block');
    if (!xml || !blocks?.length) throw new Error('The XML file does not contain Blockly blocks.');

    const unsupported_blocks = Array.from(blocks)
        .map(block => block.getAttribute('type'))
        .filter(block_type => !block_type || !Object.prototype.hasOwnProperty.call(window.Blockly.Blocks, block_type));

    if (unsupported_blocks.length) {
        throw new Error(`Unsupported Blockly blocks: ${unsupported_blocks.join(', ')}`);
    }

    return xml;
};

export const useImportNewBot = (onSuccess?: () => void) => {
    const [is_loading, setIsLoading] = React.useState(false);

    const importFile = React.useCallback((file: File) => {
        if (!file.name.toLowerCase().endsWith('.xml')) {
            show_import_error();
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
                loadXmlIntoWorkspace(parseAndValidateXml(value), workspace);
                onSuccess?.();
            } catch (error) {
                console.error('[Import New Bot] Import failed', error);
                show_import_error();
            } finally {
                setIsLoading(false);
            }
        };
        reader.onerror = () => {
            show_import_error();
            setIsLoading(false);
        };
        reader.readAsText(file);
    }, [onSuccess]);

    const onFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) importFile(file);
    }, [importFile]);

    return { importFile, onFileChange, is_loading };
};
