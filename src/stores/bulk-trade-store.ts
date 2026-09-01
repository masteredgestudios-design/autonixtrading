// @ts-nocheck — vendored bot code with known upstream type gaps
import { action, computed, makeObservable, observable, reaction } from 'mobx';
import RootStore from './root-store';

export type TBulkTradeConfig = {
    symbol: string;
    trade_type: 'even_odd' | 'over_under' | 'rise_fall' | 'differs';
    direction: 'even' | 'odd' | 'over' | 'under' | 'rise' | 'fall' | 'differs';
    digit?: number;
    duration: string;
    stake: number;
    num_trades: number;
};

export type TBulkTradeContract = {
    contract_id: string;
    batch_id: string;
    contract_index: number;
    status: 'pending' | 'submitted' | 'open' | 'won' | 'lost' | 'failed';
    payout?: number;
    profit?: number;
    bid_price?: number;
    error?: string;
    submitted_at: number;
    completed_at?: number;
};

export type TBulkTradeBatch = {
    batch_id: string;
    config: TBulkTradeConfig;
    contracts: TBulkTradeContract[];
    status: 'ready' | 'running' | 'completed' | 'failed';
    created_at: number;
    started_at?: number;
    completed_at?: number;
};

export default class BulkTradeStore {
    root_store: RootStore;
    disposeReactionsFn: () => void;

    constructor(root_store: RootStore) {
        this.root_store = root_store;
        this.disposeReactionsFn = this.registerReactions();

        makeObservable(this, {
            // Observable properties
            config: observable,
            batches: observable,
            current_batch_id: observable,
            is_executing: observable,
            is_confirmation_open: observable,

            // Computed properties
            current_batch: computed,
            total_stake: computed,
            batch_statistics: computed,

            // Actions
            setConfig: action.bound,
            setSymbol: action.bound,
            setTradeType: action.bound,
            setDirection: action.bound,
            setDigit: action.bound,
            setDuration: action.bound,
            setStake: action.bound,
            setNumTrades: action.bound,
            openConfirmation: action.bound,
            closeConfirmation: action.bound,
            createBatch: action.bound,
            startBatch: action.bound,
            updateContractStatus: action.bound,
            addBatch: action.bound,
            clearBatches: action.bound,
            registerReactions: action.bound,
        });
    }

    // Observable state
    config: TBulkTradeConfig = {
        symbol: '',
        trade_type: 'over_under',
        direction: 'over',
        digit: 1,
        duration: '1t',
        stake: 10,
        num_trades: 10,
    };

    batches: TBulkTradeBatch[] = [];
    current_batch_id: string | null = null;
    is_executing = false;
    is_confirmation_open = false;

    // Computed properties
    get current_batch(): TBulkTradeBatch | null {
        if (!this.current_batch_id) return null;
        return this.batches.find(b => b.batch_id === this.current_batch_id) || null;
    }

    get total_stake(): number {
        return this.config.stake * this.config.num_trades;
    }

    get batch_statistics() {
        if (!this.current_batch) {
            return {
                total_contracts: 0,
                submitted: 0,
                completed: 0,
                pending: 0,
                won: 0,
                lost: 0,
                failed: 0,
                win_rate: 0,
                total_stake: 0,
                current_pnl: 0,
                total_payout: 0,
            };
        }

        const batch = this.current_batch;
        const contracts = batch.contracts;

        const stats = {
            total_contracts: contracts.length,
            submitted: contracts.filter(c => c.status === 'submitted').length,
            completed: contracts.filter(c => ['won', 'lost'].includes(c.status)).length,
            pending: contracts.filter(c => ['pending', 'open'].includes(c.status)).length,
            won: contracts.filter(c => c.status === 'won').length,
            lost: contracts.filter(c => c.status === 'lost').length,
            failed: contracts.filter(c => c.status === 'failed').length,
            win_rate: 0,
            total_stake: batch.config.stake * batch.config.num_trades,
            current_pnl: 0,
            total_payout: 0,
        };

        if (stats.completed > 0) {
            stats.win_rate = (stats.won / stats.completed) * 100;
        }

        // Calculate P&L from completed contracts
        contracts.forEach(contract => {
            if (contract.status === 'won' || contract.status === 'lost') {
                stats.current_pnl += contract.profit || 0;
                stats.total_payout += contract.payout || 0;
            }
        });

        return stats;
    }

    // Actions
    setConfig(config: Partial<TBulkTradeConfig>) {
        this.config = { ...this.config, ...config };
    }

    setSymbol(symbol: string) {
        this.config.symbol = symbol;
    }

    setTradeType(trade_type: TBulkTradeConfig['trade_type']) {
        this.config.trade_type = trade_type;
        // Reset direction based on trade type
        switch (trade_type) {
            case 'even_odd':
                this.config.direction = 'even';
                break;
            case 'over_under':
                this.config.direction = 'over';
                this.config.digit = 1;
                break;
            case 'rise_fall':
                this.config.direction = 'rise';
                break;
            case 'differs':
                this.config.direction = 'differs';
                this.config.digit = 5;
                break;
        }
    }

    setDirection(direction: TBulkTradeConfig['direction']) {
        this.config.direction = direction;
    }

    setDigit(digit: number) {
        this.config.digit = digit;
    }

    setDuration(duration: string) {
        this.config.duration = duration;
    }

    setStake(stake: number) {
        this.config.stake = Math.max(0, stake);
    }

    setNumTrades(num_trades: number) {
        this.config.num_trades = Math.max(1, Math.floor(num_trades));
    }

    openConfirmation() {
        this.is_confirmation_open = true;
    }

    closeConfirmation() {
        this.is_confirmation_open = false;
    }

    createBatch(): TBulkTradeBatch {
        const batch_id = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const contracts: TBulkTradeContract[] = Array.from({ length: this.config.num_trades }, (_, i) => ({
            contract_id: '',
            batch_id,
            contract_index: i + 1,
            status: 'pending',
            submitted_at: 0,
        }));

        const batch: TBulkTradeBatch = {
            batch_id,
            config: { ...this.config },
            contracts,
            status: 'ready',
            created_at: Date.now(),
        };

        return batch;
    }

    startBatch() {
        const batch = this.createBatch();
        this.addBatch(batch);
        this.current_batch_id = batch.batch_id;
        this.is_executing = true;
        this.is_confirmation_open = false;

        // Mark batch as started
        const idx = this.batches.findIndex(b => b.batch_id === batch.batch_id);
        if (idx >= 0) {
            this.batches[idx].status = 'running';
            this.batches[idx].started_at = Date.now();
        }
    }

    addBatch(batch: TBulkTradeBatch) {
        this.batches.push(batch);
    }

    updateContractStatus(batch_id: string, contract_index: number, update: Partial<TBulkTradeContract>) {
        const batch = this.batches.find(b => b.batch_id === batch_id);
        if (!batch) return;

        const contract = batch.contracts.find(c => c.contract_index === contract_index);
        if (!contract) return;

        Object.assign(contract, update);
        contract.completed_at = update.status === 'failed' || ['won', 'lost'].includes(update.status) ? Date.now() : contract.completed_at;
    }

    clearBatches() {
        this.batches = [];
        this.current_batch_id = null;
        this.is_executing = false;
    }

    registerReactions() {
        // Check if batch is completed
        const checkBatchCompletion = reaction(
            () => this.current_batch?.contracts.map(contract => contract.status).join(','),
            () => {
                if (!this.current_batch) return;

                const batch = this.current_batch;
                const allCompleted = batch.contracts.every(c =>
                    ['won', 'lost', 'failed'].includes(c.status)
                );

                if (allCompleted && batch.status === 'running') {
                    const idx = this.batches.findIndex(b => b.batch_id === batch.batch_id);
                    if (idx >= 0) {
                        this.batches[idx].status = 'completed';
                        this.batches[idx].completed_at = Date.now();
                        this.is_executing = false;
                    }
                }
            }
        );

        return () => {
            checkBatchCompletion();
        };
    }
}
