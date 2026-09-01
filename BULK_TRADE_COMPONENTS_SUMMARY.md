# Bulk Trade Architecture & Components Summary

## Overview
The Bulk Trade feature enables users to submit multiple identical contracts concurrently to the Deriv API with real-time progress tracking and comprehensive statistics visualization.

---

## Directory Structure

### Main Components Location
`src/pages/bulk-trade/` - Contains all UI components for the Bulk Trade feature

### Supporting Services & State
- `src/services/bulk-trade-executor.ts` - API execution service
- `src/stores/bulk-trade-store.ts` - MobX state management

### Comparison Components
- `src/components/journal/` - Standard bot transaction journal (used for regular bot progress)
- `src/components/run-panel/run-panel.tsx` - Summary panel for bot statistics
- `src/components/transactions/transactions.tsx` - Transaction history display
- `src/components/summary/summary.tsx` - Bot execution summary

---

## Key Files & Their Purposes

### 1. **bulk-trade.tsx** (Main Container)
**Purpose**: Main page wrapper and layout orchestrator

**Responsibilities**:
- Renders the Bulk Trade page header with title and description
- Manages desktop vs. mobile layout (two-column on desktop, stacked on mobile)
- Hosts the configuration component on the left side
- Integrates the RunPanel (embedded) on the right side for live results
- Manages confirmation dialog visibility

**Progress Display**:
- Not directly - delegates to child components
- Controls when confirmation dialog appears

**Key Props/State**:
```typescript
- bulk_trade.is_confirmation_open - Shows/hides confirmation dialog
- isDesktop - Responsive layout switching
```

---

### 2. **bulk-trade-configuration.tsx** (User Input)
**Purpose**: Trade configuration interface

**Responsibilities**:
- Symbol selector (dynamically loaded from Deriv API)
- Trade type selector: Even/Odd, Over/Under, Rise/Fall, Differs
- Direction selector (adapts based on trade type)
- Duration selector (1t, 2t, 3t, 5t, 10t, etc. - dynamically loaded)
- Digit selector (0-9, conditional on trade type)
- Stake input with currency conversion (USD ↔ KES)
- Number of trades input (1+)
- Total stake calculation and display
- Submit button that opens confirmation dialog

**Progress Display**:
- Displays "Total Stake" calculation: `stake × num_trades`
- Helps users visualize total risk before execution

**Key Features**:
- Real-time validation of symbol and duration availability
- Currency formatting in user's selected currency
- Responsive grid layout for form fields
- Loading states for async symbol/duration fetching

---

### 3. **bulk-trade-statistics.tsx** (Live Progress Display) ⭐ KEY PROGRESS COMPONENT
**Purpose**: Real-time statistics dashboard during and after execution

**Responsibilities**:
- Displays comprehensive statistics grid with 11 metrics
- Updates live as contracts complete
- Shows progress bar with completed/total contracts

**Progress Display Metrics**:
```
✓ Total Trades          - Total number of contracts in batch
✓ Submitted             - Contracts sent to API (pending → submitted)
✓ Completed             - Contracts with final status (won/lost)
✓ Pending               - Open contracts awaiting results
✓ Wins                  - Number of winning contracts
✓ Losses                - Number of losing contracts
✓ Failed                - Contracts that failed to submit
✓ Win Rate              - (won / completed) × 100%
✓ Total Payout          - Sum of all contract payouts
✓ Profit/Loss (P&L)     - Net profit/loss (color-coded: green/red)
✓ Status                - "Running" or "Ready"
```

**Progress Bar**:
- Visual progress indicator: `width = (completed / total_contracts) × 100%`
- Shows: "Progress: N / M" with progress bar below
- Updates in real-time as contracts complete

**Data Source**:
```typescript
stats = bulk_trade.batch_statistics // Computed property from MobX store
```

---

### 4. **bulk-trade-journal.tsx** (Results History) ⭐ KEY HISTORY COMPONENT
**Purpose**: Historical record of bulk trade batches and their results

**Responsibilities**:
- Displays list of batch executions (newest first)
- For each batch shows:
  - Batch ID and status badge (READY/RUNNING/COMPLETED/FAILED)
  - Configuration details (Symbol, Trade Type, Direction, Duration)
  - Statistics: Total Trades, Completed, Wins, Losses, Failed
  - Profit/Loss display with color coding

**Progress Display**:
- Shows historical progression of trades
- Allows users to review completed batches
- Status badges indicate batch completion state
- Color-coded stats (green for wins/profit, red for losses)

**Data Source**:
```typescript
sortedBatches = [...bulk_trade.batches].sort((a, b) => b.created_at - a.created_at)
// Newest batches displayed first
```

**Batch Information Grid**:
```
Symbol          Trade Type (Even/Odd, etc.)
Direction       Duration (1t, 5t, etc.)

Total Trades    Completed
Wins            Losses
Failed          Profit/Loss
```

---

### 5. **confirmation-dialog.tsx** (Execution Trigger)
**Purpose**: Confirmation dialog before batch submission

**Responsibilities**:
- Shows trade configuration summary before execution
- Triggers BulkTradeExecutor when user confirms
- Handles errors and notifications
- Prevents accidental duplicate submissions

**Progress Display**:
- Shows summary of what will be executed
- Total stake calculation visible
- Submit and cancel options

**Execution Flow**:
1. User clicks "Start Bulk Trade" in configuration
2. Dialog shows summary (config details + total stake)
3. User confirms → `bulk_trade.startBatch()` called
4. `BulkTradeExecutor.executeBatch(batch)` starts
5. Contracts submitted concurrently to Deriv API
6. Dialog closes, statistics update in real-time

---

## State Management: BulkTradeStore

### File: `src/stores/bulk-trade-store.ts`

**Observable State**:
```typescript
config: TBulkTradeConfig              // Current configuration
batches: TBulkTradeBatch[]            // Array of all batch executions
current_batch_id: string | null       // ID of active batch
is_executing: boolean                 // Execution in progress?
is_confirmation_open: boolean         // Dialog visibility
```

**Computed Properties** (Real-time derived):
```typescript
current_batch: TBulkTradeBatch | null // Active batch object
total_stake: number                   // config.stake × config.num_trades
batch_statistics: {
    total_contracts: number           // Total contracts in current batch
    submitted: number                 // Submitted to API
    completed: number                 // Won or lost
    pending: number                   // Pending or open
    won: number                       // Winning contracts
    lost: number                      // Losing contracts
    failed: number                    // Failed submissions
    win_rate: number                  // (won / completed) × 100%
    total_stake: number               // Total risk
    current_pnl: number               // Profit/Loss
    total_payout: number              // Payout sum
}
```

**Contract Status Flow**:
```
pending → submitted → open → won (or) lost (or) failed
```

**Key Actions**:
- `setConfig()` - Update configuration
- `setSymbol()`, `setTradeType()`, `setDirection()`, etc. - Individual config updates
- `openConfirmation()` / `closeConfirmation()` - Dialog control
- `createBatch()` - Create new batch with contracts
- `startBatch()` - Start execution (creates + starts batch)
- `updateContractStatus()` - Update individual contract status
- `clearBatches()` - Reset state

**Auto-Completion Detection**:
- MobX reaction monitors contract statuses
- When all contracts reach final status (won/lost/failed):
  - Batch status → "completed"
  - `is_executing` → false
  - `completed_at` timestamp set

---

## Service: BulkTradeExecutor

### File: `src/services/bulk-trade-executor.ts`

**Purpose**: Handles concurrent contract submission to Deriv API and result tracking

**Key Methods**:

#### `executeBatch(batch: TBulkTradeBatch)`
- Validates configuration
- Checks account balance
- Submits all contracts concurrently (no sequential waiting)
- Subscribes to contract updates via WebSocket

#### `submitSingleContract(batch_id, index, config)`
- Builds API proposal from configuration
- Sends "buy" request to Deriv API
- Returns contract_id
- Updates store with submission status

#### `buildProposal(config)`
- Maps trade configuration to Deriv API format
- Sets contract type based on trade type:
  - Even/Odd → DIGITEVEN, DIGITODD
  - Over/Under → DIGITOVER, DIGITUNDER (with barrier)
  - Rise/Fall → CALL, PUT
  - Differs → DIGITDIFF (with barrier)

#### `subscribeToContractUpdates(batch_id, contract_index, contract_id)`
- Opens WebSocket subscription via `proposal_open_contract`
- Listens for contract completion
- Updates store with final status and profit/loss

**Progress Tracking**:
1. Store receives "submitted" status immediately
2. Statistics update reflects submission count
3. Contract updates → "open" when filled
4. Contract updates → "won"/"lost"/"failed" when closed
5. Statistics recalculate automatically (MobX computed properties)
6. Batch marked "completed" when all contracts done

---

## Comparison: Bot Builder Transaction Progress Display

### Standard Bot Journal Flow
**File**: `src/components/journal/journal.tsx`

**Purpose**: Real-time transaction log for bot executions

**Display Components**:
1. **Journal Header**:
   - Shows "Trading in progress" or "Bot is not running"
   - Download button for journal export
   - Filter button

2. **Journal Items** (via JournalItem component):
   - Individual log entries for each contract/event
   - Type of transaction (buy, sell, win, loss, error, etc.)
   - Timestamp and details
   - Scrollable list updated as events occur

3. **Empty State**:
   - "No activity yet" message when bot hasn't run
   - Encourages user to run bot

**Progress Tracking**:
- More granular than Bulk Trade
- Shows every event (proposal, buy, status updates)
- Includes system messages and errors
- Real-time streaming updates

### Transactions Panel
**File**: `src/components/transactions/transactions.tsx`

**Purpose**: Detailed transaction history for bot runs

**Display Components**:
1. **Transaction Headers**: Type, Entry/Exit Spot, Buy Price and P/L
2. **Transaction List**: 
   - Each row represents one contract
   - Expandable to show details
   - Color-coded by result (win/loss)
3. **Summary Stats** (from run-panel):
   - Total Stake
   - Total Payout
   - Number of Runs
   - Contracts Won/Lost
   - Total Profit/Loss

### Run Panel Statistics
**File**: `src/components/run-panel/run-panel.tsx`

**Purpose**: Summary statistics panel displayed during/after bot runs

**Display Components**:
```
┌─ StatisticsSummary ────────────────┐
│ Total Stake      │ Total Payout     │
│ No. of Runs      │ Contracts Lost   │
│ Contracts Won    │ Total Profit/Loss│
└────────────────────────────────────┘
```

**Key Difference from Bulk Trade**:
- Shows aggregate stats from ENTIRE bot run (multiple auto-generated batches)
- Win/loss counts are cumulative across all runs
- P/L is total across session
- Updates when individual contracts complete

---

## Key Differences: Bulk Trade vs Bot Builder Progress Display

| Aspect | Bulk Trade | Bot Builder |
|--------|-----------|------------|
| **Progress Display** | Single statistics grid + progress bar | Transaction list + summary panel |
| **Update Frequency** | Batch-based (shows current batch stats) | Event-based (shows every step) |
| **Granularity** | High-level (win/loss/failed counts) | Low-level (individual transaction events) |
| **History** | Journal of completed batches | Rolling list of all transactions |
| **Stats Recalculation** | Computed per batch via MobX | Aggregated across entire run |
| **Progress Indicator** | Explicit progress bar (N/M) | Implicit (count of transactions) |
| **Win Rate** | Calculated: (won / completed) × 100% | Shown in summary: contracts won/lost |
| **Manual vs Auto** | Manual batch configuration | Automatic trade placement by bot |
| **Multiple Batches** | User can run multiple batches sequentially | Single run generates trades |

---

## Data Flow: From Submission to Display

```
1. User Configuration
   ↓
2. Confirmation Dialog → User Confirms
   ↓
3. BulkTradeStore.startBatch()
   - Creates batch with N pending contracts
   - Sets is_executing = true
   ↓
4. BulkTradeExecutor.executeBatch()
   - Submits all contracts concurrently
   - Updates each to "submitted" status
   ↓
5. MobX Computed Properties Recalculate
   - batch_statistics updated automatically
   ↓
6. React Re-render
   - Statistics component displays updated counts
   - Progress bar width recalculates
   ↓
7. WebSocket Updates Arrive
   - Contract → "open" → "won"/"lost"/"failed"
   - Store.updateContractStatus() called
   ↓
8. MobX Reaction Detects Completion
   - All contracts have final status
   - Batch.status → "completed"
   - is_executing → false
   ↓
9. Final Display
   - Statistics show final counts
   - Batch added to journal history
   - Ready for next batch
```

---

## Real-Time Update Mechanism

### MobX Reactivity
**Store**: `bulk_trade-store.ts`

```typescript
// Computed: automatically re-evaluates when dependencies change
get batch_statistics() {
    // Uses current_batch.contracts array
    // Filters and counts by status
    // Calculates win_rate, pnl, payout
    return stats
}

// Reaction: runs when contracts change
reaction(
    () => this.current_batch?.contracts.map(c => c.status).join(','),
    () => {
        // Check if all completed
        // Update batch status
        // Set is_executing = false
    }
)
```

### Component Subscriptions
**React Observer Pattern**: Components wrap with `@observer`

```typescript
const BulkTradeStatistics = observer(() => {
    const { bulk_trade } = useStore();
    // Component auto-updates when:
    // - bulk_trade.batch_statistics changes
    // - bulk_trade.is_executing changes
})
```

### WebSocket Integration
**Service**: `bulk-trade-executor.ts`

```typescript
// Each contract subscribes to Deriv API
api.send({
    proposal_open_contract: 1,
    contract_id,
    subscribe: 1
})
// Listens for closure event
// Calls store.updateContractStatus()
```

---

## CSS Classes & Styling

### Progress Indicators (Statistics)
```scss
.stat-card              // Individual stat box
.stat-value.wins       // Green text for wins
.stat-value.losses     // Red text for losses
.stat-value.failed     // Grey text for failures
.stat-value.profit     // Green for positive P/L
.stat-value.loss       // Red for negative P/L

.progress-bar          // Container for progress fill
.progress-fill         // Dynamic width based on completion
```

### Status Badges (Journal)
```scss
.batch-status.ready      // Grey/inactive
.batch-status.running    // Blue/active
.batch-status.completed  // Green/success
.batch-status.failed     // Red/error
```

---

## Summary

### Progress Display Strategy
**Bulk Trade** uses a **statistics-focused** approach:
- Real-time grid of key metrics
- Visual progress bar
- Batch history for review

**Bot Builder** uses a **transaction-log** approach:
- Granular event logging
- Detailed transaction list
- Summary panel for overview

### Files Responsible for Progress Display

| Component | File | Metrics Displayed |
|-----------|------|-------------------|
| **Statistics** | `bulk-trade-statistics.tsx` | 11 metrics + progress bar |
| **Journal** | `bulk-trade-journal.tsx` | Batch history & details |
| **Store** | `bulk-trade-store.ts` | Data aggregation & state |
| **Executor** | `bulk-trade-executor.ts` | Contract lifecycle tracking |
| **Configuration** | `bulk-trade-configuration.tsx` | Pre-execution totals |

### Key Achievement
The Bulk Trade feature displays progress through **computed, reactive statistics** that update automatically as contracts complete, without requiring the granular transaction-log approach of the bot builder.
