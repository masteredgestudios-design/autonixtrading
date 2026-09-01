# Bulk Trade Feature Documentation

## Overview

The Bulk Trade feature allows users to submit multiple identical contracts to the Deriv API simultaneously. This enables efficient batch trading with a single configuration that applies to all contracts in the batch.

## Features

### Configuration
- **Symbol/Market Selection**: Choose from available Volatility indices
- **Trade Type Selection**: Even/Odd, Over/Under, Rise/Fall, Differs
- **Duration**: Select contract duration in ticks
- **Direction**: Select prediction (specific options depend on trade type)
- **Digit Selection**: Required for Over/Under and Differs trades
- **Stake**: Enter stake per trade with automatic currency conversion
- **Number of Trades**: Specify how many identical contracts to create

### Dynamic UI
- The configuration panel updates dynamically based on selected trade type
- Digit selector only appears when required for the trade type
- Total stake calculation updates in real-time

### Concurrent Execution
- All contracts are submitted to the Deriv API simultaneously
- No waiting for individual contract completion
- Reduces latency and improves execution efficiency

### Live Tracking
- Real-time statistics display while batch is executing
- Progress bar showing completed vs pending contracts
- Win/loss tracking
- Profit/loss calculation
- Win rate percentage

### Batch Journal
- Complete history of all bulk trade batches
- Detailed results for each contract in a batch
- Status indicators (pending, submitted, open, won, lost, failed)
- Profit/loss display for each contract
- Batch-level statistics

### Currency Support
- Displays values in user's selected currency (USD/KES)
- Internal API calculations always use USD
- Automatic conversion handling

## Supported Trade Types

### 1. Even/Odd
**Configuration:**
```
Symbol: Volatility 100 (1s)
Trade Type: Even/Odd
Duration: 1 Tick
Direction: Even (or Odd)
Stake: $10
Number of Trades: 10
```

**Result:** 10 Even contracts or 10 Odd contracts

### 2. Over/Under
**Configuration:**
```
Symbol: Volatility 100 (1s)
Trade Type: Over/Under
Duration: 1 Tick
Direction: Over (or Under)
Digit: 1
Stake: $10
Number of Trades: 10
```

**Result:** 10 Over 1 contracts or 10 Under 1 contracts

### 3. Rise/Fall
**Configuration:**
```
Symbol: Volatility 100 (1s)
Trade Type: Rise/Fall
Duration: 1 Tick
Direction: Rise (or Fall)
Stake: $10
Number of Trades: 10
```

**Result:** 10 Rise contracts or 10 Fall contracts

### 4. Differs
**Configuration:**
```
Symbol: Volatility 100 (1s)
Trade Type: Matches/Differs
Duration: 1 Tick
Direction: Differs
Digit: 5
Stake: $10
Number of Trades: 10
```

**Result:** 10 Differs 5 contracts

Note: Only "Differs" is available for execution (Matches is not supported for bulk trading)

## Usage Flow

### Step 1: Navigate to Bulk Trade Tab
Click on the "Bulk Trade" tab in the main navigation.

### Step 2: Configure Trade Parameters
1. Select a symbol/market
2. Choose a trade type
3. Select duration
4. Choose direction
5. If required, select a digit (0-9)
6. Enter stake per trade
7. Enter number of trades
8. Review total stake display

### Step 3: Review Configuration
Click "Start Bulk Trade" to open the confirmation dialog.

### Step 4: Confirm
Review the trade summary in the confirmation dialog:
- Symbol
- Trade Type
- Direction & Digit (if applicable)
- Duration
- Stake per trade
- Number of trades
- Total stake

Click "Confirm & Start" to submit the batch.

### Step 5: Monitor Execution
Once submitted:
- Statistics panel shows real-time progress
- Contracts transition through states: pending → submitted → open → won/lost/failed
- Progress bar updates as contracts complete
- Journal updates with contract results

### Step 6: Review Results
After batch completion:
- View aggregated statistics (wins, losses, profit/loss)
- Review individual contract results in the journal
- View complete batch history

## Error Handling

### Validation
- Symbol must be selected
- Duration must be selected
- Stake must be greater than 0
- Number of trades must be at least 1
- Digit must be 0-9 if required for trade type

### Execution Errors
- Individual contract failures are isolated and don't affect other contracts
- Failed contracts show error messages in the journal
- Batch completion statistics reflect actual submitted vs failed counts
- Successful submission of 9/10 contracts is reported accurately

### Balance Checks
- Bulk trade validates sufficient balance before execution
- Total stake requirement: (stake per trade) × (number of trades)
- Error message shows required vs available balance

## Currency Handling

### Display Currency
- All values displayed in user's selected currency (USD or KES)
- Format: "$10.00" (USD) or "KSh 1,290.00" (KES)

### Internal Processing
- All Deriv API calls use USD
- Automatic conversion from KES to USD for stake input
- Automatic conversion of results from USD to display currency

### Example
User in KES viewing:
- Input: KSh 1,290
- Converted to: $10 USD (for API)
- Results received: $17.65 USD
- Displayed as: KSh 2,276.85

## Technical Architecture

### State Management
- **Store**: `src/stores/bulk-trade-store.ts` (MobX observable store)
- Manages configuration, batch history, and current execution state
- Computed properties for statistics aggregation

### Service Layer
- **Executor**: `src/services/bulk-trade-executor.ts`
- Handles Deriv API communication
- Manages concurrent contract submission
- Tracks contract results via WebSocket subscriptions

### Components
- **Configuration**: Form inputs for batch setup
- **Statistics**: Live metrics display during execution
- **Journal**: History and detailed results
- **Confirmation**: Pre-execution review dialog

### Integration
- Uses existing Deriv API infrastructure
- Integrates with currency context for conversions
- WebSocket connections managed by Deriv API base class
- Notifications via bot-notification system

## Performance Considerations

### Concurrent Submission
- All contracts submitted within milliseconds of each other
- Deriv API handles rate limiting
- No artificial delays between submissions

### Real-time Updates
- WebSocket subscriptions for each active contract
- Efficient observer pattern with MobX
- UI updates only when data changes

### Memory Management
- Contract subscriptions cleaned up after completion
- Batch history retained for user review
- Large batches (100+) may require pagination (future enhancement)

## Limitations & Notes

### Current Version
- Maximum 100 trades per batch (configurable)
- Symbols limited to available Volatility indices
- Duration limited to tick-based options
- No scheduled/future batch execution

### Deriv API Constraints
- Rate limiting applies to rapid sequential batches
- WebSocket connection must remain active during execution
- Contract results subject to Deriv's settlement times
- Closing tab may interrupt batch tracking (reconnection handling in place)

## Troubleshooting

### Batch Won't Start
- Check: Symbol is selected
- Check: Duration is selected
- Check: Stake > 0 and Number of Trades ≥ 1
- Check: Sufficient balance available
- Check: Deriv connection active

### Contracts Not Completing
- Check: Internet connection stable
- Check: WebSocket connection active
- Check: Tab remains in focus
- Check: Deriv API not rate-limited

### Missing Results
- Results are cached in browser storage
- Results indexed by user login ID
- Check: User is still logged in
- Check: Browser storage not cleared

### Currency Display Issues
- Exchange rate fetched from `/api/exchange-rate` endpoint
- Rate cached and updated periodically
- Manual refresh available via currency selector

## API Integration

### Contract Submission
```typescript
// Deriv API proposal format
{
  amount: number,
  basis: 'stake',
  currency: 'USD',
  duration: number,
  duration_unit: 't', // ticks
  symbol: string,
  contract_type: string, // DIGITEVEN, DIGITODD, etc.
  barrier?: string, // optional, for Over/Under and Differs
}
```

### Contract Tracking
```typescript
// WebSocket subscription for updates
{
  proposal_open_contract: {
    contract_id: string,
    profit: number,
    payout: number,
    status: string,
    is_open: boolean,
    bid_price: number,
  }
}
```

## Future Roadmap

### Phase 2
- [ ] Template saving and quick-load
- [ ] Advanced journal filtering and search
- [ ] Export results to CSV/Excel
- [ ] Win rate and performance statistics dashboard

### Phase 3
- [ ] Scheduled batch execution
- [ ] Conditional contract parameters
- [ ] Smart retry for failed contracts
- [ ] Batch result notifications/alerts

### Phase 4
- [ ] Integration with trading strategies
- [ ] Historical pattern analysis
- [ ] Custom alert thresholds
- [ ] API access for third-party integrations
