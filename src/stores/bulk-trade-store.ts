import { action, computed, makeObservable, observable } from 'mobx';
import RootStore from './root-store';

export type BulkTradeType = 'even_odd' | 'over_under' | 'rise_fall' | 'differs';
export type BulkDirection = 'even' | 'odd' | 'over' | 'under' | 'rise' | 'fall' | 'differs';
export type BulkStatus = 'pending' | 'submitted' | 'open' | 'won' | 'lost' | 'failed';
export type BulkConfig = { symbol: string; trade_type: BulkTradeType; direction: BulkDirection; digit?: number; duration: string; stake_usd: number; number_of_trades: number };
export type BulkContract = { index: number; contract_id?: string; status: BulkStatus; error?: string };
export type BulkBatch = { id: string; config: BulkConfig; contracts: BulkContract[] };

export default class BulkTradeStore {
    constructor(public readonly root_store: RootStore) {
        makeObservable(this, { config: observable, batch: observable, is_executing: observable, statistics: computed, setConfig: action.bound, setTradeType: action.bound, startBatch: action.bound, updateContract: action.bound, finishBatch: action.bound });
    }
    config: BulkConfig = { symbol: '', trade_type: 'over_under', direction: 'over', digit: 1, duration: '', stake_usd: 1, number_of_trades: 10 };
    batch: BulkBatch | null = null;
    is_executing = false;
    get statistics() {
        const contracts = this.batch?.contracts ?? [];
        const completed = contracts.filter(c => c.status === 'won' || c.status === 'lost').length;
        return { requested: contracts.length, submitted: contracts.filter(c => c.status !== 'pending' && c.status !== 'failed').length, failed: contracts.filter(c => c.status === 'failed').length, pending: contracts.filter(c => ['pending', 'submitted', 'open'].includes(c.status)).length, completed, wins: contracts.filter(c => c.status === 'won').length, losses: contracts.filter(c => c.status === 'lost').length };
    }
    setConfig(update: Partial<BulkConfig>) { this.config = { ...this.config, ...update }; }
    setTradeType(trade_type: BulkTradeType) {
        const defaults: Record<BulkTradeType, Partial<BulkConfig>> = { even_odd: { direction: 'even', digit: undefined }, over_under: { direction: 'over', digit: 1 }, rise_fall: { direction: 'rise', digit: undefined }, differs: { direction: 'differs', digit: 5 } };
        this.config = { ...this.config, trade_type, ...defaults[trade_type] };
    }
    startBatch(): BulkBatch | null {
        if (this.is_executing) return null;
        const id = `BULK-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        this.batch = { id, config: { ...this.config }, contracts: Array.from({ length: this.config.number_of_trades }, (_, i) => ({ index: i + 1, status: 'pending' })) };
        this.is_executing = true;
        return this.batch;
    }
    updateContract(index: number, update: Partial<BulkContract>) { const contract = this.batch?.contracts.find(c => c.index === index); if (contract) Object.assign(contract, update); }
    finishBatch() { this.is_executing = false; }
}
