// @ts-nocheck — vendored bot code with known upstream type gaps
import { api_base } from '@/external/bot-skeleton';
import { LogTypes } from '@/external/bot-skeleton';
import { TBulkTradeConfig, TBulkTradeBatch } from '@/stores/bulk-trade-store';
import BulkTradeStore from '@/stores/bulk-trade-store';

/**
 * BulkTradeExecutor handles concurrent submission of contracts to the Deriv API
 * and tracks their results.
 */
export class BulkTradeExecutor {
    private store: BulkTradeStore;
    private subscription_ids: Map<string, number> = new Map();
    private contract_listeners: Map<string, any> = new Map();
    private completed_contracts: Set<string> = new Set();
    private contract_snapshots: Map<string, any> = new Map();

    constructor(store: BulkTradeStore) {
        this.store = store;
    }

    /**
     * Submit a batch of contracts concurrently to the Deriv API
     */
    async executeBatch(batch: TBulkTradeBatch): Promise<void> {
        const config = batch.config;
        const contracts = batch.contracts;

        // Validate configuration
        if (!this.validateConfig(config)) {
            throw new Error('Invalid configuration');
        }

        // Check balance
        const api = api_base.api;
        if (!api) {
            throw new Error('Deriv API not initialized');
        }

        // Get current balance to ensure sufficient funds
        try {
            const balance = await this.getCurrentBalance();
            const totalStake = config.stake * config.num_trades;
            if (balance < totalStake) {
                throw new Error(`Insufficient balance. Required: $${totalStake}, Available: $${balance}`);
            }
        } catch (error) {
            console.error('Failed to check balance:', error);
            throw error;
        }

        // Submit all contracts concurrently
        const submissionPromises = contracts.map((contract, index) =>
            this.submitSingleContract(batch.batch_id, index, config)
                .then(contract_id => {
                    this.store.updateContractStatus(batch.batch_id, index + 1, {
                        contract_id,
                        status: 'submitted',
                    });

                    // Subscribe to contract updates
                    void this.subscribeToContractUpdates(batch.batch_id, index + 1, contract_id);
                })
                .catch(error => {
                    console.error(`Failed to submit contract ${index + 1}:`, error);
                    this.store.updateContractStatus(batch.batch_id, index + 1, {
                        status: 'failed',
                        error: error.message,
                    });
                })
        );

        // Wait for all submissions to complete (not for the contracts themselves)
        await Promise.all(submissionPromises);
    }

    /**
     * Submit a single contract to the Deriv API
     */
    private async submitSingleContract(batch_id: string, index: number, config: TBulkTradeConfig): Promise<string> {
        const api = api_base.api;
        if (!api) throw new Error('Deriv API not initialized');

        const proposal = this.buildProposal(config);

        const buyResponse = await api.send({
            buy: '1',
            price: proposal.amount,
            parameters: {
                amount: proposal.amount,
                basis: proposal.basis,
                contract_type: proposal.contract_type,
                currency: proposal.currency,
                duration: proposal.duration,
                duration_unit: proposal.duration_unit,
                underlying_symbol: proposal.symbol,
                ...(proposal.barrier !== undefined ? { barrier: proposal.barrier } : {}),
            },
        });

        if (buyResponse?.error) {
            throw new Error(buyResponse.error.message || 'Buy request failed');
        }

        if (!buyResponse?.buy?.contract_id) {
            throw new Error('Buy response did not include a contract_id');
        }

        this.publishContract({
            id: buyResponse.buy.contract_id,
            contract_id: buyResponse.buy.contract_id,
            contract_type: proposal.contract_type,
            currency: proposal.currency,
            buy_price: buyResponse.buy.buy_price ?? proposal.amount,
            transaction_ids: {
                buy: buyResponse.buy.transaction_id,
            },
            is_open: true,
            is_sold: false,
            date_start: Math.floor(Date.now() / 1000),
            profit: 0,
        });

        return buyResponse.buy.contract_id;
    }

    /**
     * Build a proposal request based on the trade configuration
     */
    private buildProposal(config: TBulkTradeConfig): any {
        const proposal: any = {
            amount: config.stake,
            basis: 'stake',
            currency: 'USD',
            duration: this.parseDuration(config.duration),
            duration_unit: 't',
            symbol: config.symbol,
        };

        // Set contract type based on trade type
        switch (config.trade_type) {
            case 'even_odd':
                proposal.contract_type = config.direction === 'even' ? 'DIGITEVEN' : 'DIGITODD';
                break;
            case 'over_under':
                proposal.contract_type = config.direction === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
                proposal.barrier = config.digit.toString();
                break;
            case 'rise_fall':
                proposal.contract_type = config.direction === 'rise' ? 'CALL' : 'PUT';
                break;
            case 'differs':
                proposal.contract_type = 'DIGITDIFF';
                proposal.barrier = config.digit.toString();
                break;
        }

        return proposal;
    }

    /**
     * Parse duration string (e.g., "1t" -> 1)
     */
    private parseDuration(duration: string): number {
        const match = duration.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 1;
    }

    /**
     * Map user-friendly symbol name to Deriv API symbol
     */
    private mapSymbol(symbol: string): string {
        const symbolMap: { [key: string]: string } = {
            volidx_1s: '1HZ100V',
            volidx_10s: '10HZ100V',
            volidx_1m: '1HZ100V', // Adjust based on actual API symbols
        };
        return symbolMap[symbol] || symbol;
    }

    /**
     * Subscribe to contract updates (when contract closes)
     */
    private async subscribeToContractUpdates(batch_id: string, contract_index: number, contract_id: string): Promise<void> {
        const api = api_base.api;
        if (!api) return;

        try {
            const response = await api.send({
                proposal_open_contract: 1,
                contract_id,
                subscribe: 1,
            });
            this.handleContractUpdate(batch_id, contract_index, response?.proposal_open_contract);

            if (!api.connection?.addEventListener) return;

            const handleMessage = (event: MessageEvent) => {
                let data = event.data;
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    } catch {
                        return;
                    }
                }

                const contract = data?.proposal_open_contract;
                if (contract?.contract_id !== contract_id) return;

                this.handleContractUpdate(batch_id, contract_index, contract);
                if (!contract.is_open) {
                    api.connection.removeEventListener('message', handleMessage);
                    this.contract_listeners.delete(contract_id);
                }
            };
            api.connection.addEventListener('message', handleMessage);
            this.contract_listeners.set(contract_id, {
                unsubscribe: () => api.connection.removeEventListener('message', handleMessage),
            });
        } catch (error: any) {
            console.error(`Error tracking contract ${contract_id}:`, error);
            this.store.updateContractStatus(batch_id, contract_index, {
                status: 'submitted',
                error: error.message,
            });
        }
    }

    private handleContractUpdate(batch_id: string, contract_index: number, contract: any): void {
        if (!contract?.contract_id) return;

        const previous_contract = this.contract_snapshots.get(String(contract.contract_id)) ?? {};
        const merged_contract = {
            ...previous_contract,
            ...contract,
            transaction_ids: {
                ...(previous_contract.transaction_ids ?? {}),
                ...(contract.transaction_ids ?? {}),
            },
        };

        if (!merged_contract.transaction_ids.buy && merged_contract.transaction_id) {
            merged_contract.transaction_ids.buy = merged_contract.transaction_id;
        }

        this.contract_snapshots.set(String(contract.contract_id), merged_contract);

        this.publishContract({
            id: merged_contract.contract_id,
            ...merged_contract,
            is_sold: merged_contract.is_sold ?? merged_contract.is_open === false,
            is_completed: merged_contract.is_open === false || merged_contract.status === 'sold',
        });

        if (!merged_contract.is_open) {
            const profit = Number(merged_contract.profit) || 0;
            this.store.updateContractStatus(batch_id, contract_index, {
                status: profit >= 0 ? 'won' : 'lost',
                payout: Number(merged_contract.payout ?? merged_contract.bid_price) || 0,
                profit,
            });
        } else {
            this.store.updateContractStatus(batch_id, contract_index, {
                status: 'open',
                bid_price: Number(merged_contract.bid_price) || 0,
            });
        }
    }

    private publishContract(contract: any): void {
        const contract_id = contract.contract_id ?? contract.id;
        if (!contract_id) return;

        const transaction_ids = contract.transaction_ids ?? {};
        const normalized_contract = {
            ...contract,
            id: contract.id ?? contract_id,
            contract_id,
            transaction_ids,
            currency: contract.currency ?? 'USD',
            buy_price: Number(contract.buy_price ?? contract.amount) || 0,
            profit: Number(contract.profit) || 0,
            is_open: contract.is_open ?? true,
            is_completed: contract.is_completed ?? contract.is_open === false,
        };
        const transactions = this.store.root_store?.transactions;
        if (transactions?.onBotContractEvent) {
            transactions.onBotContractEvent(normalized_contract);
        }

        const summary_card = this.store.root_store?.summary_card;
        if (summary_card?.onBotContractEvent) {
            summary_card.onBotContractEvent(normalized_contract);
        }

        if (normalized_contract.is_open === false && !this.completed_contracts.has(contract_id)) {
            this.completed_contracts.add(contract_id);
            const journal = this.store.root_store?.journal;
            journal?.onLogSuccess?.({
                log_type: normalized_contract.profit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
                extra: { currency: normalized_contract.currency, profit: normalized_contract.profit },
            });
        }
    }

    /**
     * Get current account balance
     */
    private async getCurrentBalance(): Promise<number> {
        const api = api_base.api;
        if (!api) throw new Error('Deriv API not initialized');

        const response = await api.balance();

        if (response?.error) {
            throw new Error(response.error.message || 'Failed to fetch current balance');
        }

        return parseFloat(response?.balance?.balance || '0') || 0;
    }

    /**
     * Validate trade configuration
     */
    private validateConfig(config: TBulkTradeConfig): boolean {
        if (!config.symbol) return false;
        if (!config.trade_type) return false;
        if (!config.direction) return false;
        if (!config.duration) return false;
        if (config.stake <= 0) return false;
        if (config.num_trades < 1) return false;

        // Validate digit if required
        if (['over_under', 'differs'].includes(config.trade_type)) {
            if (config.digit === undefined || config.digit < 0 || config.digit > 9) return false;
        }

        return true;
    }

    /**
     * Clean up subscriptions
     */
    cleanup(): void {
        this.contract_listeners.forEach((subscription) => {
            subscription.unsubscribe();
        });
        this.contract_listeners.clear();
        this.subscription_ids.clear();
        this.completed_contracts.clear();
        this.contract_snapshots.clear();
    }
}

export default BulkTradeExecutor;
