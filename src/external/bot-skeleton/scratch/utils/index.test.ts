import { normalizeStrategyXml } from './index';

describe('normalizeStrategyXml', () => {
    it('rejects malformed XML and keeps valid Blockly XML', () => {
        expect(normalizeStrategyXml('<xml><block type="trade_definition"></xml>')).toBeNull();
        expect(normalizeStrategyXml('<xml><block type="trade_definition" /></xml>')).not.toBeNull();
    });

    it('removes empty or unsupported block payloads but preserves valid strategy structure', () => {
        const xml = normalizeStrategyXml('<xml><block type="trade_definition" /><block type="unknown" /></xml>');
        expect(xml).not.toBeNull();
        expect(xml?.querySelectorAll('block').length).toBe(1);
    });
});
