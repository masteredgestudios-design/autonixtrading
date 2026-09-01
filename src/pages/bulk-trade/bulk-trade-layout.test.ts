import fs from 'fs';
import path from 'path';

describe('Bulk Trade layout', () => {
    const stylePath = path.join(__dirname, 'bulk-trade.scss');
    const configStylePath = path.join(__dirname, 'bulk-trade-configuration.scss');
    const configComponentPath = path.join(__dirname, 'bulk-trade-configuration.tsx');
    const bulkTradeComponentPath = path.join(__dirname, 'bulk-trade.tsx');
    const confirmationDialogPath = path.join(__dirname, 'confirmation-dialog.tsx');
    const statisticsComponentPath = path.join(__dirname, 'bulk-trade-statistics.tsx');

    it('allows the bulk trade section to scroll naturally instead of clipping the submit CTA', () => {
        const css = fs.readFileSync(stylePath, 'utf8');

        expect(css).toContain('overflow-y: auto');
        expect(css).toContain('height: 100%;');
        expect(css).not.toContain('overflow: hidden;');
    });

    it('keeps the submit button in the normal flow instead of a sticky footer that hides it', () => {
        const css = fs.readFileSync(configStylePath, 'utf8');

        expect(css).not.toContain('position: sticky');
        expect(css).toContain('justify-content: center');
    });

    it('does not render Total Stake in the bulk trade summary or stats views', () => {
        const configSource = fs.readFileSync(configComponentPath, 'utf8');
        const confirmationSource = fs.readFileSync(confirmationDialogPath, 'utf8');
        const statisticsSource = fs.readFileSync(statisticsComponentPath, 'utf8');

        expect(configSource).not.toContain('Total Stake');
        expect(confirmationSource).not.toContain('Total Stake');
        expect(statisticsSource).not.toContain('Total Stake');
    });

    it('does not offer hardcoded durations when live contract metadata is unavailable', () => {
        const configSource = fs.readFileSync(configComponentPath, 'utf8');

        expect(configSource).not.toContain("const DURATIONS =");
        expect(configSource).toContain('setAvailableDurations([])');
    });

    it('uses one shared Summary, Transactions, and Journal surface', () => {
        const bulkTradeSource = fs.readFileSync(bulkTradeComponentPath, 'utf8');

        expect(bulkTradeSource.match(/<DrawerContent/g)).toHaveLength(1);
        expect(bulkTradeSource).not.toContain('BulkTradeJournal');
        expect(bulkTradeSource).not.toContain('journal-card');
    });
});
