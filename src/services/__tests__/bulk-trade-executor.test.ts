import BulkTradeExecutor from '../bulk-trade-executor';
import { api_base } from '@/external/bot-skeleton';
import BulkTradeStore from '@/stores/bulk-trade-store';

jest.mock('@/external/bot-skeleton', () => ({
    api_base: {
        api: null,
    },
    LogTypes: {
        PROFIT: 'profit',
        LOST: 'lost',
    },
}));

describe('BulkTradeExecutor', () => {
    beforeEach(() => {
        const api = {
            balance: jest.fn().mockResolvedValue({ balance: { balance: '250.00', currency: 'USD', loginid: 'CR123' } }),
            buy: jest.fn(),
            send: jest.fn().mockResolvedValue({ buy: { contract_id: 'contract-123', transaction_id: 'txn-123' } }),
            proposal_open_contract: jest.fn(),
        };

        (api_base as any).api = api;
    });

    it('fetches the current balance using the promise-based Deriv API contract', async () => {
        const executor = new BulkTradeExecutor(new BulkTradeStore({} as any));

        await expect((executor as any).getCurrentBalance()).resolves.toBe(250);
        expect((api_base.api as any).balance).toHaveBeenCalledTimes(1);
    });

    it('submits a single contract using the real buy response shape', async () => {
        const executor = new BulkTradeExecutor(new BulkTradeStore({} as any));

        await expect(
            (executor as any).submitSingleContract('batch-1', 0, {
                symbol: '1HZ100V',
                trade_type: 'over_under',
                direction: 'over',
                digit: 1,
                duration: '1t',
                stake: 10,
                num_trades: 1,
            })
        ).resolves.toBe('contract-123');

        expect((api_base.api as any).send).toHaveBeenCalledWith({
            buy: '1',
            price: 10,
            parameters: {
                amount: 10,
                basis: 'stake',
                contract_type: 'DIGITOVER',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                underlying_symbol: '1HZ100V',
                barrier: '1',
            },
        });
    });

    it('submits all configured contracts concurrently without failing on tracking setup', async () => {
        const store = new BulkTradeStore({} as any);
        store.setConfig({
            symbol: '1HZ100V',
            trade_type: 'over_under',
            direction: 'over',
            digit: 1,
            duration: '1t',
            stake: 10,
            num_trades: 10,
        });
        const batch = store.createBatch();

        await new BulkTradeExecutor(store).executeBatch(batch);

        const buyRequests = (api_base.api as any).send.mock.calls.filter(([request]) => request.buy === '1');
        expect(buyRequests).toHaveLength(10);
        expect(buyRequests[0][0]).toMatchObject({
            buy: '1',
            price: 10,
            parameters: expect.objectContaining({
                contract_type: 'DIGITOVER',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                underlying_symbol: '1HZ100V',
                barrier: '1',
            }),
        });
        expect(batch.contracts.every(contract => contract.status === 'pending')).toBe(true);
    });

    it('keeps contract identity when a later update omits transaction ids', () => {
        const store = new BulkTradeStore({
            transactions: { onBotContractEvent: jest.fn() },
            summary_card: { onBotContractEvent: jest.fn() },
            journal: { onLogSuccess: jest.fn() },
        } as any);
        const executor = new BulkTradeExecutor(store);
        const initial_contract = {
            contract_id: 'contract-123',
            transaction_ids: { buy: 'txn-123' },
            is_open: true,
            buy_price: 10,
        };

        (executor as any).handleContractUpdate('batch-1', 1, initial_contract);
        (executor as any).handleContractUpdate('batch-1', 1, {
            contract_id: 'contract-123',
            is_open: false,
            profit: 2,
            payout: 12,
        });

        const published_contract = (store.root_store.transactions.onBotContractEvent as jest.Mock).mock.calls[1][0];
        expect(published_contract.transaction_ids.buy).toBe('txn-123');
        expect(store.root_store.summary_card.onBotContractEvent).toHaveBeenCalledTimes(2);
        expect(store.current_batch).toBeNull();
    });
});
