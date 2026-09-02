import { LogTypes, api_base } from '@/external/bot-skeleton';
import { isEnded } from '@/components/shared/utils/contract/contract';
import BulkTradeStore, { BulkBatch, BulkConfig } from '@/stores/bulk-trade-store';

type TrackedContract = { batch_id: string; index: number };

export default class BulkTradeExecutor {
    private tracked = new Map<string, TrackedContract>();
    private snapshots = new Map<string, any>();
    private message_subscription?: { unsubscribe?: () => void };

    constructor(private readonly store: BulkTradeStore) {}

    async execute(batch: BulkBatch): Promise<void> {
        const api = api_base.api;
        if (!api) throw new Error('Deriv connection is not ready.');
        if (!this.validate(batch.config)) throw new Error('Please check the bulk trade configuration.');
        const balance = await api.balance();
        if (Number(balance?.balance?.balance) < batch.config.stake_usd * batch.config.number_of_trades) throw new Error('Insufficient balance.');

        await Promise.all(batch.contracts.map(contract => this.submit(api, batch, contract.index)));
        this.finishIfComplete(batch);
    }

    private async submit(api: any, batch: BulkBatch, index: number) {
        try {
            const proposal = this.proposal(batch.config);
            const response = await api.send({ buy: '1', price: proposal.amount, parameters: proposal });
            const contract_id = response?.buy?.contract_id;
            if (response?.error || !contract_id) throw new Error(response?.error?.message || 'Contract purchase failed.');
            this.store.updateContract(index, { contract_id, status: 'submitted' });
            this.tracked.set(String(contract_id), { batch_id: batch.id, index });
            this.installListener(api);
            const initial = await api.send({ proposal_open_contract: 1, contract_id, subscribe: 1 });
            this.update(batch, index, {
                ...initial?.proposal_open_contract,
                transaction_ids: {
                    buy: response.buy.transaction_id || `bulk-${batch.id}-${index}`,
                },
            });
        } catch (error: any) {
            this.store.updateContract(index, { status: 'failed', error: error?.message || 'Unknown purchase error.' });
            this.finishIfComplete(batch);
        }
    }

    private installListener(api: any) {
        if (this.message_subscription || !api.onMessage) return;
        const listener = (data: any) => {
            const message = data?.data ?? data;
            const contract = message?.proposal_open_contract;
            const tracked = contract?.contract_id && this.tracked.get(String(contract.contract_id));
            if (tracked) this.update(this.store.batch!, tracked.index, contract);
        };
        this.message_subscription = api.onMessage().subscribe(listener);
    }

    private update(batch: BulkBatch, index: number, contract: any) {
        if (!contract?.contract_id) return;
        const id = String(contract.contract_id);
        const merged = { ...(this.snapshots.get(id) || {}), ...contract };
        this.snapshots.set(id, merged);
        const is_open = !isEnded(merged) && merged.is_open !== false && merged.is_sold !== true;
        const profit = Number(merged.profit) || 0;
        this.store.updateContract(index, { status: is_open ? 'open' : profit >= 0 ? 'won' : 'lost' });
        const published = {
            ...merged,
            id: merged.id || merged.contract_id,
            contract_id: merged.contract_id,
            currency: 'USD',
            buy_price: Number(merged.buy_price || batch.config.stake_usd),
            profit: is_open ? 0 : profit,
            is_open,
            is_completed: !is_open,
            transaction_ids: merged.transaction_ids?.buy
                ? merged.transaction_ids
                : { ...(merged.transaction_ids || {}), buy: `bulk-${batch.id}-${index}` },
        };
        this.store.root_store.transactions?.onBotContractEvent?.(published);
        this.store.root_store.summary_card?.onBotContractEvent?.(published);
        if (!is_open) this.store.root_store.journal?.onLogSuccess?.({ log_type: profit > 0 ? LogTypes.PROFIT : LogTypes.LOST, extra: { currency: 'USD', profit } });
        this.finishIfComplete(batch);
        if (!is_open) this.tracked.delete(id);
    }

    private finishIfComplete(batch: BulkBatch) {
        if (batch.contracts.every(contract => ['won', 'lost', 'failed'].includes(contract.status))) { this.store.finishBatch(); this.cleanup(); }
    }

    private proposal(config: BulkConfig) {
        const [duration, duration_unit = 't'] = config.duration.match(/^(\d+)([a-z]+)$/i)?.slice(1) || ['1', 't'];
        const contract_type = config.trade_type === 'even_odd' ? (config.direction === 'even' ? 'DIGITEVEN' : 'DIGITODD') : config.trade_type === 'over_under' ? (config.direction === 'over' ? 'DIGITOVER' : 'DIGITUNDER') : config.trade_type === 'rise_fall' ? (config.direction === 'rise' ? 'CALL' : 'PUT') : 'DIGITDIFF';
        return { amount: config.stake_usd, basis: 'stake', contract_type, currency: 'USD', duration: Number(duration), duration_unit, underlying_symbol: config.symbol, ...(config.trade_type === 'over_under' || config.trade_type === 'differs' ? { barrier: String(config.digit) } : {}) };
    }

    private validate(config: BulkConfig) { return !!config.symbol && !!config.duration && config.stake_usd > 0 && config.number_of_trades > 0 && (!['over_under', 'differs'].includes(config.trade_type) || config.digit !== undefined); }
    cleanup() { this.message_subscription?.unsubscribe?.(); this.message_subscription = undefined; this.tracked.clear(); this.snapshots.clear(); }
}
