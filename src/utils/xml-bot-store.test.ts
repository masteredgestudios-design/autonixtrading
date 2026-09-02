import { getXmlBotStoreCatalog } from './xml-bot-store';

describe('xml bot store catalog', () => {
    it('returns embedded XML bot entries from the bundled manifest', async () => {
        const mockXml = `<?xml version="1.0"?><xml><block type="trade_definition"/></xml>`;
        const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('manifest.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        {
                            id: 'smart-digit-predictor',
                            file_name: 'DIFFERS Exit Value.xml',
                            name: 'Smart Digit Predictor',
                            description: 'A smart digit strategy.',
                            strategy_type: 'Digits / Differs',
                            market: 'Synthetic Index',
                            symbol: '1HZ10V',
                            xml: mockXml,
                        },
                        {
                            id: 'least-frequent-digit-differ',
                            file_name: 'least appearing digit differ.xml',
                            name: 'Least Frequent Digit Differ',
                            description: 'A least-frequent strategy.',
                            strategy_type: 'Digits / Differs',
                            market: 'Synthetic Index',
                            symbol: '1HZ25V',
                            xml: mockXml,
                        },
                    ],
                } as Response);
            }
            return Promise.resolve({
                ok: true,
                text: async () => mockXml,
            } as Response);
        });

        const bots = await getXmlBotStoreCatalog();

        expect(bots).toHaveLength(2);
        expect(bots[0].name).toBe('Smart Digit Predictor');
        expect(bots[0].file_name).toBe('DIFFERS Exit Value.xml');
        expect(bots[0].xml).toContain('<block type="trade_definition"');

        fetchMock.mockRestore();
    });
});
