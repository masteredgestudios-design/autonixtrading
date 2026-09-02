// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load } from '@/external/bot-skeleton/scratch';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { getXmlBotStoreCatalog, type XmlBotDefinition } from '@/utils/xml-bot-store';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

const waitForWorkspace = async () => {
    const started_at = Date.now();
    while (Date.now() - started_at < 6000) {
        const workspace = window.Blockly?.derivWorkspace;
        if (workspace && !workspace.isDisposed?.()) return workspace;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
};

const XmlBotStore = observer(() => {
    const { dashboard } = useStore();
    const { setActiveTab } = dashboard;
    const { isDesktop } = useDevice();
    const [bots, setBots] = React.useState<XmlBotDefinition[]>([]);
    const [is_loading, setIsLoading] = React.useState(true);
    const [is_loading_bot_id, setIsLoadingBotId] = React.useState<string | null>(null);

    React.useEffect(() => {
        let is_active = true;
        const loadCatalog = async () => {
            try {
                const items = await getXmlBotStoreCatalog();
                if (!is_active) return;
                setBots(items);
            } catch (error) {
                console.error('[XML Bot Store] Failed to load catalog', error);
                if (is_active) setBots([]);
            } finally {
                if (is_active) setIsLoading(false);
            }
        };
        loadCatalog();
        return () => {
            is_active = false;
        };
    }, []);

    const handleLoadBot = React.useCallback(
        async (bot: XmlBotDefinition) => {
            setActiveTab(DBOT_TABS.BOT_BUILDER);
            const workspace = await waitForWorkspace();
            if (!workspace) {
                console.error('[XML Bot Store] Blockly workspace is not ready.');
                return;
            }

            setIsLoadingBotId(bot.id);
            try {
                const result = await load({
                    block_string: bot.xml,
                    workspace,
                    file_name: bot.name,
                    strategy_id: bot.id,
                    from: 'xml_store',
                    drop_event: {},
                    showIncompatibleStrategyDialog: false,
                    show_snackbar: true,
                });

                if (result?.error) {
                    throw new Error(result.error);
                }

                workspace.strategy_to_load = bot.xml;
                workspace.current_strategy_id = bot.id;
            } catch (error) {
                console.error('[XML Bot Store] Failed to load bot into workspace', error);
            } finally {
                setIsLoadingBotId(null);
            }
        },
        [setActiveTab]
    );

    if (is_loading) {
        return (
            <div className='xml-bot-store xml-bot-store--loading'>
                <Text color='prominent' size={isDesktop ? 's' : 'xs'} weight='bold'>
                    {localize('Loading bot library...')}
                </Text>
            </div>
        );
    }

    if (!bots.length) {
        return (
            <div className='xml-bot-store xml-bot-store--empty'>
                <div className='xml-bot-store__empty-card'>
                    <Text color='prominent' size={isDesktop ? 's' : 'xs'} weight='bold'>
                        {localize('No XML bots available yet')}
                    </Text>
                    <Text color='less-prominent' size={isDesktop ? 'xs' : 'xxs'}>
                        {localize('Add XML bot files to the xmlbots folder to populate this library.')}
                    </Text>
                </div>
            </div>
        );
    }

    return (
        <div className='xml-bot-store'>
            <div className='xml-bot-store__grid'>
                {bots.map(bot => (
                    <article key={bot.id} className='xml-bot-store__card'>
                        <div className='xml-bot-store__card-header'>
                            <div className='xml-bot-store__icon' aria-hidden='true'>
                                {bot.strategy_type?.charAt(0)?.toUpperCase() || 'B'}
                            </div>
                            <div className='xml-bot-store__meta'>
                                <Text as='h3' color='prominent' size={isDesktop ? 's' : 'xs'} weight='bold'>
                                    {bot.name}
                                </Text>
                                <div className='xml-bot-store__tags'>
                                    {bot.strategy_type && (
                                        <span className='xml-bot-store__tag'>{bot.strategy_type}</span>
                                    )}
                                    {bot.symbol && <span className='xml-bot-store__tag'> {bot.symbol} </span>}
                                </div>
                            </div>
                        </div>

                        <Text className='xml-bot-store__description' color='less-prominent' size={isDesktop ? 'xs' : 'xxs'}>
                            {bot.description}
                        </Text>

                        <div className='xml-bot-store__details'>
                            <div>
                                <span className='xml-bot-store__label'>Market</span>
                                <span>{bot.market}</span>
                            </div>
                            <div>
                                <span className='xml-bot-store__label'>Source</span>
                                <span>{bot.file_name}</span>
                            </div>
                        </div>

                        <button
                            type='button'
                            className='xml-bot-store__button'
                            onClick={() => handleLoadBot(bot)}
                            disabled={is_loading_bot_id === bot.id}
                        >
                            {is_loading_bot_id === bot.id ? localize('Loading...') : localize('Load Bot')}
                        </button>
                    </article>
                ))}
            </div>
        </div>
    );
});

const Cards = observer(({ is_mobile, has_dashboard_strategies }: TCardProps) => {
    return (
        <div
            className={classNames('tab__dashboard__table', {
                'tab__dashboard__table--minimized': has_dashboard_strategies && is_mobile,
            })}
        >
            <XmlBotStore />
        </div>
    );
});

export default Cards;
