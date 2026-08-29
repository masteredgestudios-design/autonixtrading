import React from 'react';
import { useImportNewBot } from '@/components/import-new-bot/use-import-new-bot';
import { localize } from '@deriv-com/translations';
import { LabelPairedFolderOpenMdRegularIcon } from '@deriv/quill-icons/LabelPaired';
import ToolbarIcon from './toolbar-icon';

const ImportNewBotButton = () => {
    const file_input_ref = React.useRef<HTMLInputElement>(null);
    const { onFileChange, is_loading } = useImportNewBot();

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