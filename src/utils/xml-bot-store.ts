export type XmlBotDefinition = {
    id: string;
    name: string;
    description: string;
    strategy_type: string;
    market: string;
    symbol: string;
    file_name: string;
    xml: string;
    tags?: string[];
    file?: string;
};

const manifestUrl = './xmlbot-manifest.json';

const fallbackCatalog: XmlBotDefinition[] = [];

const getResolvedAssetUrl = (path: string) => {
    if (typeof window === 'undefined') return path;

    const basePath = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : `${window.location.pathname}/`;

    return new URL(path, `${window.location.origin}${basePath}`).toString();
};

const getFileName = (bot: Partial<XmlBotDefinition>) => bot.file_name || bot.file || '';

export const getXmlBotStoreCatalog = async (): Promise<XmlBotDefinition[]> => {
    try {
        const response = await fetch(getResolvedAssetUrl(manifestUrl), { cache: 'no-store' });
        if (!response.ok) {
            return fallbackCatalog;
        }

        const payload = (await response.json()) as Partial<XmlBotDefinition>[];
        if (!Array.isArray(payload)) {
            return fallbackCatalog;
        }

        const catalog = await Promise.all(
            payload.map(async bot => {
                if (!bot || typeof bot !== 'object') return null;

                const file_name = getFileName(bot);
                if (!file_name) return null;

                const xml = typeof bot.xml === 'string' && bot.xml.trim() ? bot.xml : null;
                const normalized = {
                    ...bot,
                    file_name,
                    file: file_name,
                    name: bot.name || file_name.replace(/\.xml$/i, ''),
                    description: bot.description || 'Built-in XML bot strategy.',
                    strategy_type: bot.strategy_type || 'Custom',
                    market: bot.market || 'Synthetic Index',
                    symbol: bot.symbol || 'Custom',
                    xml: xml || '',
                } as XmlBotDefinition;

                if (!normalized.xml) {
                    try {
                        const xmlUrl = getResolvedAssetUrl(`./xmlbots/${encodeURIComponent(file_name)}`);
                        const xmlResponse = await fetch(xmlUrl, { cache: 'no-store' });
                        if (xmlResponse.ok) {
                            normalized.xml = await xmlResponse.text();
                        }
                    } catch (error) {
                        console.warn('[XML Bot Store] Unable to fetch XML for bot.', file_name, error);
                    }
                }

                if (!normalized.xml?.trim()) {
                    return null;
                }

                return normalized;
            })
        );

        return catalog.filter((bot): bot is XmlBotDefinition => !!bot);
    } catch (error) {
        console.warn('[XML Bot Store] Unable to load manifest fallback.', error);
        return fallbackCatalog;
    }
};
