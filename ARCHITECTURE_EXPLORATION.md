# ATDBot React Application - Architecture Exploration

**Date:** August 30, 2026  
**App Version:** 0.4.1  
**Node Version:** >=22

---

## Table of Contents
1. [Main Tabs Implementation](#1-main-tabs-implementation)
2. [App Routing Structure](#2-app-routing-structure)
3. [Deriv API & WebSocket Connection](#3-deriv-api--websocket-connection)
4. [Supported Trade Types](#4-supported-trade-types)
5. [Currency Conversion (USD/KES)](#5-currency-conversion-usdkes)
6. [Journal Component Structure](#6-journal-component-structure)
7. [Trade Submission & Results Tracking](#7-trade-submission--results-tracking)
8. [Contract Proposal & Purchase Logic](#8-contract-proposal--purchase-logic)
9. [State Management Architecture](#9-state-management-architecture)
10. [Pages & Components Structure](#10-pages--components-structure)

---

## 1. Main Tabs Implementation

### Tab Structure
The main application tabs (Dashboard, Bot Builder, Charts, Tutorials) are implemented as route-based pages in React Router.

**Key Files:**
- [src/pages/main/main.tsx](src/pages/main/main.tsx) - Main tab container with navigation
- [src/constants/bot-contents.ts](src/constants/bot-contents.ts) - Tab configuration constants (DBOT_TABS)
- [src/components/layout/index.tsx](src/components/layout/index.tsx) - Main layout wrapper

### Tab List
1. **Dashboard** (`/dashboard`) - Strategy management, bot execution controls
2. **Bot Builder** (`/bot_builder`) - Blockly workspace for strategy creation
3. **Charts** (`/chart`) - Trading view charts and analysis
4. **Tutorials** (`/tutorial`) - Learning resources and guided tours

### Tab Navigation Implementation
```typescript
// src/pages/main/main.tsx (lines ~48-60)
const hash = ['dashboard', 'bot_builder', 'chart', 'tutorial'];
const { DASHBOARD, BOT_BUILDER } = DBOT_TABS;

// Tabs component renders:
// - Dashboard: Dashboard component
// - Bot Builder: BotBuilder component  
// - Chart: ChartWrapper component (lazy loaded)
// - Tutorial: Tutorial component (lazy loaded)
```

**Related Components:**
- [src/components/shared_ui/tabs/tabs.tsx](src/components/shared_ui/tabs/tabs.tsx) - Tab UI component
- [src/pages/dashboard/index.tsx](src/pages/dashboard/index.tsx) - Dashboard tab page
- [src/pages/bot-builder/index.tsx](src/pages/bot-builder/index.tsx) - Bot Builder tab page
- [src/pages/chart/](src/pages/chart/) - Charts tab page
- [src/pages/tutorials/](src/pages/tutorials/) - Tutorials tab page

---

## 2. App Routing Structure

### Router Configuration
React Router v8 (Router, createBrowserRouter) is used for client-side routing.

**Key Files:**
- [src/app/App.tsx](src/app/App.tsx) - Main router setup (lines 33-60)
- [src/main.tsx](src/main.tsx) - App entry point
- [src/app/app-content.jsx](src/app/app-content.jsx) - App shell rendering

### Route Hierarchy
```typescript
// src/app/App.tsx
<Route path="/">  {/* Root route */}
  <Route index element={<AppRoot />} />  {/* Home page */}
  <Route path="preview" element={<AppRoot />} />  {/* Preview mode */}
</Route>
```

### Router Basename
- **Preview Mode**: `/bot/preview` (PREVIEW_BASE_PATH)
- **Standalone Deploy**: Root path `/` (process.env.NEXT_PUBLIC_APP_BASE_PATH)

### Key Routing Providers (Wrapping Order)
1. **RouterProvider** - React Router
2. **TranslationProvider** - i18n (@deriv-com/translations)
3. **CurrencyProvider** - Currency context ([src/contexts/currency-context.tsx](src/contexts/currency-context.tsx))
4. **StoreProvider** - MobX store (useStore hook)
5. **LocalStorageSyncWrapper** - Local storage sync
6. **RoutePromptDialog** - Unsaved changes warning
7. **CoreStoreProvider** - Core initialization

### OAuth & Account Handling
- OAuth callback handling: [src/app/App.tsx](src/app/App.tsx) (lines 74-100)
- Account switching via URL parameter: `useAccountSwitching` hook
- Account list fetching: DerivWSAccountsService

---

## 3. Deriv API & WebSocket Connection

### API Initialization
The app uses `@deriv/deriv-api` for WebSocket connections to the Deriv trading API.

**Key Files:**
- [src/external/bot-skeleton/services/api/api-base.ts](src/external/bot-skeleton/services/api/api-base.ts) - Main API class
- [src/external/bot-skeleton/services/api/appId.ts](src/external/bot-skeleton/services/api/appId.ts) - DerivAPI instance factory
- [src/app/app-root.tsx](src/app/app-root.tsx) - API initialization (lines 42-69)

### API Base Class (APIBase)
Located in `api-base.ts`, manages:
- WebSocket connection to Deriv servers
- Authorization via token
- Subscription management (balance, transactions, proposal_open_contract)
- Account information caching
- Server time synchronization
- Reconnection logic with max 5 attempts

### Connection Lifecycle
```typescript
// src/external/bot-skeleton/services/api/api-base.ts

class APIBase {
    // WebSocket connection states
    onsocketopen() {
        setConnectionStatus(CONNECTION_STATUS.OPENED);
        handleTokenExchangeIfNeeded();  // OAuth token exchange
    }
    
    // Authorization with token
    async authorizeAndSubscribe() {
        const { authorize } = await this.api.authorize(token);
        // Subscribe to: balance, transaction, proposal_open_contract
        this.current_auth_subscriptions.push(...);
    }
    
    // Account management
    handleTokenExchangeIfNeeded() {
        // Check URL params: account_id, account_type
        // Store in localStorage: active_loginid, account_type
    }
}
```

### WebSocket URL Configuration
[src/components/shared/utils/config/config.ts](src/components/shared/utils/config/config.ts):
- Uses authenticated flow: `getWebSocketOTP()` from deriv-core
- Supports different servers for staging/production
- OAuth app ID: `process.env.NEXT_PUBLIC_DERIV_APP_ID`

### Flask Session Bootstrap
[src/app/app-root.tsx](src/app/app-root.tsx) (lines 22-40):
```typescript
const loadFlaskSession = async () => {
    // Fetch: /auth/session (with credentials)
    // Response: { isAuthenticated, accounts[], activeAccount }
    // Stores:
    // - sessionStorage: 'deriv_accounts' 
    // - localStorage: 'accountsList', 'clientAccounts', 'active_loginid', 'account_type'
}
```

### Observable Streams (RxJS)
Located in [src/external/bot-skeleton/services/api/observables/connection-status-stream.ts](src/external/bot-skeleton/services/api/observables/connection-status-stream.ts):
- `isAuthorized$` - Authorization state
- `connectionStatus$` - WebSocket connection state (OPENED, CLOSED, ERROR)
- `setConnectionStatus()` - Update connection status
- `CONNECTION_STATUS` constants

### Server Time Synchronization
[src/app/CoreStoreProvider.tsx](src/app/CoreStoreProvider.tsx) (lines 82-111):
- Calls `api_base.api.time()` every 10 seconds
- Updates common store with server time
- Falls back to client time on error

---

## 4. Supported Trade Types

### Trade Type Categories & Options

**File:** [src/external/bot-skeleton/constants/config.ts](src/external/bot-skeleton/constants/config.ts) (lines 232-252)

```typescript
TRADE_TYPE_CATEGORIES: {
    multiplier: ['multiplier'],
    callput: ['callput', 'callputequal', 'higherlower'],
    touchnotouch: ['touchnotouch'],
    inout: ['endsinout', 'staysinout'],
    asian: ['asians'],
    digits: ['matchesdiffers', 'evenodd', 'overunder'],
    reset: ['reset'],
    callputspread: ['callputspread'],
    highlowticks: ['highlowticks'],
    runs: ['runs'],
    accumulator: ['accumulator'],
}
```

### Trade Type Details

#### Multipliers
- **Category:** `multiplier`
- **Options:** `['multiplier']`
- **Opposites:** UP / DOWN
- **API Contract Types:** MULTUP, MULTDOWN

#### Up/Down (Rise/Fall)
- **Category:** `callput`
- **Options:** `['callput', 'callputequal', 'higherlower']`
  - `callput`: Rise/Fall
  - `callputequal`: Rise Equals/Fall Equals
  - `higherlower`: Higher/Lower
- **API Contract Types:** CALL, PUT, CALLE, PUTE

#### Touch/No Touch
- **Category:** `touchnotouch`
- **Options:** `['touchnotouch']`
- **API Contract Types:** ONETOUCH, NOTOUCH

#### In/Out (Ends/Stays)
- **Category:** `inout`
- **Options:** `['endsinout', 'staysinout']`
  - `endsinout`: Ends Between / Ends Outside
  - `staysinout`: Stays Between / Goes Outside
- **API Contract Types:** EXPIRYRANGE, EXPIRYMISS, RANGE, UPORDOWN

#### Asians
- **Category:** `asian`
- **Options:** `['asians']`
- **API Contract Types:** ASIANU, ASIAND

#### Digits
- **Category:** `digits`
- **Options:** `['matchesdiffers', 'evenodd', 'overunder']`
  - `matchesdiffers`: Matches / Differs
  - `evenodd`: Even / Odd
  - `overunder`: Over / Under
- **API Contract Types:** DIGITMATCH, DIGITDIFF, DIGITEVEN, DIGITODD, DIGITOVER, DIGITUNDER

#### Reset Call/Put
- **Category:** `reset`
- **Options:** `['reset']`
- **API Contract Types:** RESETCALL, RESETPUT

#### High/Low Ticks
- **Category:** `highlowticks`
- **Options:** `['highlowticks']`
- **API Contract Types:** TICKHIGH, TICKLOW

#### Only Ups/Only Downs
- **Category:** `runs`
- **Options:** `['runs']`
- **API Contract Types:** RUNHIGH, RUNLOW

#### Accumulators
- **Category:** `accumulator`
- **Options:** `['accumulator']`
- **API Contract Types:** ACCU

### Trade Type Mapping
**File:** [src/utils/url-trade-type-handler.ts](src/utils/url-trade-type-handler.ts)

URL parameters are mapped to internal trade types:
```typescript
const URL_TO_TRADE_TYPE_MAPPING: Record<string, string> = {
    'rise_fall': 'callput',
    'higher_lower': 'callput',
    'touch_no_touch': 'touchnotouch',
    'in_out': 'inout',
    'digits': 'digits',
    'multiplier': 'multiplier',
    'accumulator': 'accumulator',
    'asian': 'asian',
    'reset': 'reset',
    'high_low_ticks': 'highlowticks',
    'only_ups_downs': 'runs',
    // ... additional mappings
}
```

### Contract Types Definition
**File:** [src/constants/contract.ts](src/constants/contract.ts)

Defines TypeScript type `TContractType` with all supported contract values:
- ACCU, ASIANU, ASIAND, CALL, PUT, CALLE, PUTE, etc.

---

## 5. Currency Conversion (USD/KES)

### Currency Context Provider
**File:** [src/contexts/currency-context.tsx](src/contexts/currency-context.tsx)

Provides global currency state and conversion utilities:

```typescript
type CurrencyContextValue = {
    currency: DisplayCurrency;  // 'USD' | 'KES'
    rate: number;  // USD to KES exchange rate
    setCurrency: (currency: DisplayCurrency) => void;
    formatMoney: (amount: number | string, options?: Intl.NumberFormatOptions) => string;
    fromUsd: (amount: number | string) => number;  // Convert USD to display currency
    toUsd: (amount: number | string) => number;  // Convert display currency to USD
};
```

### Conversion Logic
**File:** [src/services/currency.service.ts](src/services/currency.service.ts)

```typescript
// Core conversion functions
export const usdToKes = (amount: number, rate: number) => roundMoney(amount * rate);
export const kesToUsd = (amount: number, rate: number) => roundMoney(amount / rate);

export const convertFromUsd = (amount: number, currency: DisplayCurrency, rate: number) =>
    currency === 'KES' && rate > 0 ? usdToKes(amount, rate) : amount;

export const convertToUsd = (amount: number, currency: DisplayCurrency, rate: number) =>
    currency === 'KES' && rate > 0 ? kesToUsd(amount, rate) : amount;

// Formatting (e.g., "KSh 1,290.00" for KES, "$10.00" for USD)
export const formatDisplayMoney = (amount: number | string, currency: DisplayCurrency, rate: number) => {
    const converted = convertFromUsd(Number(amount), currency, rate);
    const formatted = new Intl.NumberFormat('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(converted);
    return currency === 'KES' ? `KSh ${formatted}` : `$${formatted}`;
};
```

### Exchange Rate Fetching
```typescript
// Fetches from: /api/exchange-rate (BFF endpoint)
export const fetchUsdToKesRate = async (): Promise<number> => {
    const response = await fetch('/api/exchange-rate', { credentials: 'include' });
    const data = await response.json();  // { rate: number }
    return data.rate;
};
```

### Storage Keys
- `display_currency` (localStorage) - Current display currency preference
- `usd_to_kes_rate` (localStorage) - Cached exchange rate

### Usage in Components
**File:** [src/components/currency/display-currency-switcher.tsx](src/components/currency/display-currency-switcher.tsx)

```typescript
const { currency, setCurrency } = useCurrency();

<select value={currency} onChange={(e) => setCurrency(e.target.value)}>
    <option value="USD">USD ($)</option>
    <option value="KES">KES (KSh)</option>
</select>
```

**File:** [src/components/shared_ui/input-field/input-field.tsx](src/components/shared_ui/input-field/input-field.tsx) (lines 173, 294)

Dynamic input conversion:
```typescript
if (prefix && currency === 'USD' && displayCurrency === 'KES' && e.target.value !== '') {
    // Convert input value from KES to USD for internal processing
}
```

---

## 6. Journal Component Structure

### Journal Component
**File:** [src/components/journal/journal.tsx](src/components/journal/journal.tsx)

Main journal display showing bot trading activity:

```typescript
const Journal = observer(() => {
    const { journal, run_panel } = useStore();
    const {
        checked_filters,
        filterMessage,
        filters,
        filtered_messages,
        is_filter_dialog_visible,
        toggleFilterDialog,
        unfiltered_messages,
    } = journal;
    
    return (
        <div className='journal'>
            <div className='journal__header'>
                <span>Bot activity</span>
                <Download tab='journal' />
                <button onClick={toggleFilterDialog}>Filter</button>
            </div>
            <FilterDialog {...filterProps} />
            <div className='journal__item-list'>
                {filtered_messages.map(row => <JournalItem key={row.unique_id} row={row} />)}
            </div>
        </div>
    );
});
```

### Journal Sub-Components
**Directory:** [src/components/journal/journal-components/](src/components/journal/journal-components/)

- **JournalItem** - Individual journal entry
- **format-message.tsx** - Message formatting (e.g., "Bought: Contract purchased (ID: {{transaction_id}})")
- **FilterDialog** - Journal filtering UI

### Journal Types
**File:** [src/components/journal/journal.types.ts](src/components/journal/journal.types.ts)

```typescript
type TFilterMessageValues = {
    unique_id: string;
    // Additional properties...
}

type TCheckedFilters = {
    [key: string]: boolean;
}
```

### Journal Store
**File:** [src/stores/journal-store.ts](src/stores/journal-store.ts)

Manages:
- `unfiltered_messages` - All messages
- `filtered_messages` - Messages matching active filters
- `checked_filters` - Active filter selections
- `toggleFilterDialog()` - Show/hide filter dialog
- Message filtering logic

### Message Types
```typescript
// From src/constants/transactions.ts and LogTypes
- 'CONTRACT' - Trade contract message
- 'DIVIDER' - Visual separator
- 'INFO' - System information
- 'ERROR' - Error message
- 'SUCCESS' - Success notification
```

---

## 7. Trade Submission & Results Tracking

### Run Panel Store
**File:** [src/stores/run-panel-store.ts](src/stores/run-panel-store.ts)

Manages bot execution state and contract lifecycle:

```typescript
export default class RunPanelStore {
    // Observable state
    is_running: boolean;
    contract_stage: TContractStage;  // See contract stages
    has_open_contract: boolean;
    is_contract_buying_in_progress: boolean;
    
    // Main methods
    onBotRunningEvent() { /* Bot started */ }
    onBotStopEvent() { /* Bot stopped */ }
    onBotTradeAgain() { /* Continue after trade */ }
    onContractStatusEvent(data) { /* Contract update */ }
    onClickSell() { /* Manual contract sell */ }
}
```

### Contract Stages
**File:** [src/constants/contract-stage.ts](src/constants/contract-stage.ts)

```typescript
export const contract_stages = {
    NOT_RUNNING: 0,
    STARTING: 1,
    RUNNING: 2,
    PURCHASE_SENT: 3,
    PURCHASE_RECEIVED: 4,
    IS_STOPPING: 5,
    STOPPED: 6,
    LOST: 7,
    WON: 8,
};
```

### Trade Submission Flow
1. **Bot Execution**: RunPanelStore.onBotRunningEvent()
2. **Purchase Sent**: contract_stage = PURCHASE_SENT
3. **API Request**: Buy contract via Deriv API
4. **Purchase Received**: contract_stage = PURCHASE_RECEIVED, contract stored
5. **Contract Updates**: OnMessage from API (proposal_open_contract stream)
6. **Contract Settlement**: is_completed = true, profit/loss calculated

### Transactions Store
**File:** [src/stores/transactions-store.ts](src/stores/transactions-store.ts)

Tracks all trades and their results:

```typescript
export default class TransactionsStore {
    elements: TElement = {};  // Transactions by user
    recovered_transactions: number[];  // Recovered pending contracts
    recovered_completed_transactions: number[];  // Recovered completed contracts
    
    // Methods
    onBotContractEvent(data: ProposalOpenContract) { /* Process contract event */ }
    pushTransaction(transaction: TTransaction) { /* Add transaction */ }
    updateResultsCompletedContract(contract: ProposalOpenContract) { /* Mark completed */ }
    recoverPendingContracts() { /* Recover on-page contracts */ }
    
    // Computed
    get statistics() {
        // Returns: {
        //   won_contracts: number,
        //   lost_contracts: number,
        //   total_profit: number,
        //   total_payout: number,
        //   total_stake: number,
        // }
    }
}
```

### Transaction Storage
- **Cached in:** sessionStorage + localStorage (transaction_cache)
- **Keyed by:** Login ID (userId)
- **Recovers on:** Page reload, account switch

### Result Calculation
```typescript
const profit = Number(contract.profit) || 0;
const buy_price = Number(contract.buy_price) || 0;
const payout = Number(contract.payout) || Number(contract.bid_price) || 0;

if (profit > 0) {
    stats.won_contracts += 1;
    stats.total_payout += payout;
} else {
    stats.lost_contracts += 1;
}
stats.total_profit += profit;
stats.total_stake += buy_price;
```

---

## 8. Contract Proposal & Purchase Logic

### Proposal Request
The app requests contract proposals before purchase to validate parameters.

**Files:**
- [src/external/bot-skeleton/scratch/options-proposal-handler.tsx](src/external/bot-skeleton/scratch/options-proposal-handler.tsx) - Standard options proposals
- [src/external/bot-skeleton/scratch/accumulators-proposal-handler.tsx](src/external/bot-skeleton/scratch/accumulators-proposal-handler.tsx) - Accumulator proposals

### Options Proposal Handler
```typescript
interface OptionsProposalRequest {
    proposal: number;  // 1 for single proposal
    symbol: string;
    currency: string;
    amount: number;
    barrier?: string;
    basis: string;  // 'stake' or 'payout'
    // ... other fields
}

export const requestOptionsProposalForQS = (
    request: OptionsProposalRequest,
    api: any
): Promise<ProposalResponse>
```

**Response Structure:**
```typescript
interface ProposalResponse {
    proposal?: {
        validation_params?: {
            max_payout: number;
            min_stake: number;
            max_stake: number;
        };
        contract_details?: {
            minimum_stake: number;
            maximum_stake: number;
        };
        id: string;  // Proposal ID for purchase
    };
    error?: { code: string; message: string };
}
```

### Quick Strategy Proposal Validation
**File:** [src/pages/bot-builder/quick-strategy/selects/contract-type.tsx](src/pages/bot-builder/quick-strategy/selects/contract-type.tsx)

```typescript
const request_proposal: TProposalRequest = {
    proposal: 1,
    symbol: values.symbol,
    currency: client.currency,
    amount: values.stake,
    basis: 'stake',
    contract_type: selectedContractType,
    // ... other parameters
};

const response = await requestOptionsProposalForQS(request_proposal, api_base.api);
// Validates contract parameters and retrieves min/max stakes, payout
```

### Contract Purchase
Purchase happens via the Blockly interpreter calling the Deriv API:

1. **Proposal validation** → Get proposal ID
2. **User confirmation** → Execute purchase
3. **API buy_contract** → Send to Deriv API
4. **Update stage** → PURCHASE_SENT → PURCHASE_RECEIVED

**Related Event Handlers:**
- `run-panel-store.ts`: `onBotContractEvent()`
- `transactions-store.ts`: `onBotContractEvent()`

### Backend Error Messages
**File:** [src/constants/backend-error-messages.ts](src/constants/backend-error-messages.ts)

Contains error handling for proposal/purchase failures:
- `ProposalsNotReady`
- `SelectedProposalNotExist`
- `ContractBuyValidationError`
- `InvalidContractProposal`
- `ClientUnwelcome` - Account not authorized for purchases

---

## 9. State Management Architecture

### State Management Solution: MobX + React Context

The app uses **MobX** for observable state management with React Context for some global state.

**Dependencies:**
- `mobx`: ^6.12.3
- `mobx-react-lite`: ^4.0.7

### Root Store
**File:** [src/stores/root-store.ts](src/stores/root-store.ts)

Central store containing all domain stores:

```typescript
export default class RootStore {
    // Domain stores
    public app: AppStore;
    public summary_card: SummaryCardStore;
    public flyout: FlyoutStore;
    public journal: JournalStore;
    public load_modal: LoadModalStore;
    public run_panel: RunPanelStore;
    public transactions: TransactionsStore;
    public quick_strategy: QuickStrategyStore;
    public dashboard: DashboardStore;
    public chart_store: ChartStore;
    public blockly_store: BlocklyStore;
    
    // Core stores (client, UI, common)
    public ui: UiStore;
    public client: ClientStore;
    public common: CommonStore;
}
```

### Store Provider Hook
**File:** [src/hooks/useStore.tsx](src/hooks/useStore.tsx)

```typescript
const StoreContext = React.createContext<RootStore | null>(null);

export const useStore = () => {
    const store = useContext(StoreContext);
    if (!store) throw new Error('Store not found');
    return store;
};

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
    const store = useMemo(() => new RootStore(dbot), []);
    return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
};
```

### Key Stores

#### Client Store
**File:** [src/stores/client-store.ts](src/stores/client-store.ts)

Manages user account and authentication state:
- `loginid` - Account ID
- `is_logged_in` - Authentication status
- `currency` - Account currency
- `balance` - Account balance
- `residence` - User residence

#### Common Store
**File:** [src/stores/common-store.ts](src/stores/common-store.ts)

Shared application state:
- `server_time` - Synchronized server time
- `current_language` - Active language
- `error` - Global error state

#### Dashboard Store
**File:** [src/stores/dashboard-store.ts](src/stores/dashboard-store.ts)

Dashboard state:
- `active_tab` - Currently active tab
- `is_chart_modal_visible`
- `is_trading_view_modal_visible`
- `setActiveTab()`

#### App Store
**File:** [src/stores/app-store.ts](src/stores/app-store.ts)

High-level app state and event handling

#### Blockly Store
**File:** [src/stores/blockly-store.ts](src/stores/blockly-store.ts)

Blockly workspace state:
- `is_loading` - Workspace loading
- `workspace` - Blockly workspace instance

### Context Providers

In addition to MobX stores:

#### CurrencyContext
**File:** [src/contexts/currency-context.tsx](src/contexts/currency-context.tsx)

- `currency` - Display currency (USD/KES)
- `rate` - Exchange rate
- `setCurrency()` - Change display currency
- `formatMoney()` - Format with current currency

#### TranslationProvider
`@deriv-com/translations` i18n context

#### ThemeProvider
`@deriv-com/quill-ui` theme context

### Observable Decorators (MobX)

```typescript
class Store {
    // Define observable properties
    @observable
    is_running = false;
    
    @observable
    active_tab = 'dashboard';
    
    // Computed derived values
    @computed
    get is_stop_button_visible() {
        return this.is_running || this.has_open_contract;
    }
    
    // Observable actions
    @action
    startBot() {
        this.is_running = true;
    }
    
    // Observers are components wrapped with observer()
    const MyComponent = observer(() => {
        const { is_running } = useStore().run_panel;
        // Automatically re-renders when is_running changes
        return <div>{is_running ? 'Running' : 'Stopped'}</div>;
    });
}
```

### Observer Usage Pattern
Components use MobX observer pattern for reactivity:

```typescript
const Component = observer(() => {
    const store = useStore();
    // Component automatically re-renders on observable changes
    return <div>{store.observable_value}</div>;
});
```

---

## 10. Pages & Components Structure

### Pages Directory
**Location:** [src/pages/](src/pages/)

```
pages/
├── bot-builder/        # Bot strategy builder with Blockly
│   ├── index.tsx       # Bot builder main component
│   ├── quick-strategy/ # Quick strategy selector
│   └── ...
├── chart/              # Trading charts
│   ├── chart-wrapper.tsx
│   ├── chart-modal.tsx
│   └── trading-view-chart/
├── dashboard/          # Dashboard & strategy management
│   ├── index.tsx
│   ├── announcements/
│   ├── run-strategy/
│   └── ...
├── main/               # Main tab container
│   ├── main.tsx        # Routes between tabs
│   └── main.scss
└── tutorials/          # Learning & tutorials
    ├── index.tsx
    ├── dbot-tours/
    └── constants.ts
```

### Components Directory
**Location:** [src/components/](src/components/)

#### Layout Components
```
layout/
├── app-logo/           # Logo display
├── footer/             # Footer with links
├── header/             # Top navigation
│   ├── account-switcher.tsx
│   ├── header.tsx
│   └── menu-items/
└── main-body/          # Main content area
```

#### Core Components
```
├── journal/            # Bot activity log
│   ├── journal.tsx     # Main component
│   ├── journal-components/ # Sub-components
│   └── journal.types.ts
│
├── run-panel/          # Bot execution controls
│   ├── index.tsx
│   ├── run-panel.tsx
│   └── ...
│
├── trade-type-confirmation-modal/  # Trade type selector
│   └── trade-type-confirmation-modal.tsx
│
├── trade-type/         # Trade type icon/display
│   └── trade-type-icon.tsx
│
├── summary/            # Summary card statistics
│   ├── summary-card.tsx
│   └── summary-card.types.ts
│
├── transactions/       # Transaction list
│   ├── transaction.tsx
│   └── ...
│
├── contract-card-loading/ # Loading state
├── contract-result-overlay/ # Result display
├── currency/           # Currency display/switcher
│   └── display-currency-switcher.tsx
├── download/           # Download journal/stats
├── loader/             # Loading indicators
├── bot-notification/   # Notifications
├── chat/               # Live chat integration
├── market/             # Market selection
└── ...
```

#### Shared UI Components
```
shared_ui/
├── contract-card/      # Contract display card
├── dialog/             # Modal dialogs
├── dropdown-list/      # Dropdowns
├── input-field/        # Form inputs
├── tabs/               # Tab navigation
├── desktop-wrapper/    # Desktop-only layout
├── mobile-wrapper/     # Mobile-only layout
└── ...
```

### Shared Utilities & Constants
**Location:** [src/components/shared/](src/components/shared/)

```
shared/
├── utils/
│   ├── constants/
│   │   ├── contract.ts        # Contract types & labels
│   │   └── barriers.ts        # Barrier configuration
│   │
│   ├── contract/
│   │   ├── contract.tsx       # Contract utilities
│   │   ├── contract-types.ts  # Type definitions
│   │   └── trade-url-params-config.ts
│   │
│   ├── helpers/
│   │   ├── active-symbols.ts
│   │   ├── details.ts
│   │   └── market-underlying.ts
│   │
│   ├── config/
│   │   └── config.ts          # WebSocket URLs, etc.
│   │
│   └── location/
│       └── location.ts        # Geolocation utils
│
└── constants/
    └── form-error-messages.ts
```

### Services
**Location:** [src/services/](src/services/)

```
services/
├── currency.service.ts         # USD/KES conversion
├── derivws-accounts.service.ts # DerivWS account management
├── active-symbol-categorization.service.ts  # Market categorization
└── __tests__/                  # Service tests
```

### Hooks
**Location:** [src/hooks/](src/hooks/)

```
hooks/
├── useStore.tsx                # MobX store access
├── useApiBase.tsx              # API connection status
├── useLanguageFromURL.tsx      # Language URL parameter
├── useAccountSwitching.tsx     # Account switching
├── useLogout.tsx               # Logout handler
├── useThemeSwitcher.tsx        # Dark/light theme
├── useInvalidTokenHandler.tsx  # Token expiry
├── useDevMode.tsx              # Dev mode shortcuts
└── api/
    ├── account/
    │   └── useActiveAccount.tsx
    └── ...
```

### Constants
**Location:** [src/constants/](src/constants/)

```
constants/
├── contract.ts                 # Contract types & enums
├── contract-stage.ts           # Bot contract execution stages
├── bot-contents.ts             # Tab configuration
├── transactions.ts             # Transaction element types
├── backend-error-messages.ts   # API error messages
└── ...
```

### External Integrations
**Location:** [src/external/](src/external/)

```
external/
├── bot-skeleton/               # Vendored bot engine
│   ├── constants/
│   │   └── config.ts          # Trade types, barriers, etc.
│   ├── services/
│   │   ├── api/               # Deriv API wrapper
│   │   └── ...
│   ├── scratch/               # Blockly blocks
│   │   ├── options-proposal-handler.tsx
│   │   └── ...
│   └── utils/
│       ├── observer.ts        # Event observer pattern
│       └── ...
│
└── deriv-core/                 # Vendored Deriv utilities
    ├── auth/                   # OAuth, WebSocket OTP
    ├── config/
    └── types/
```

---

## Summary: Data Flow

### Authentication Flow
1. OAuth callback → [src/app/App.tsx](src/app/App.tsx) handleOAuthCallback()
2. Get account list → DerivWSAccountsService.fetchAccountsList()
3. Store accounts in localStorage/sessionStorage
4. Establish WebSocket → api_base.init()
5. Authorize with token → api_base.authorizeAndSubscribe()
6. Subscribe to streams → balance, proposal_open_contract, transactions

### Trade Execution Flow
1. User creates/runs strategy in [src/pages/bot-builder/](src/pages/bot-builder/)
2. Blockly interpreter executes the strategy
3. Request proposal → [src/external/bot-skeleton/scratch/options-proposal-handler.tsx](src/external/bot-skeleton/scratch/options-proposal-handler.tsx)
4. Purchase contract → Deriv API buy_contract
5. Update run_panel.contract_stage → [src/stores/run-panel-store.ts](src/stores/run-panel-store.ts)
6. Track transaction → [src/stores/transactions-store.ts](src/stores/transactions-store.ts)
7. Display in journal → [src/components/journal/journal.tsx](src/components/journal/journal.tsx)
8. Show results in summary card → [src/components/summary/](src/components/summary/)

### Currency Flow
1. User selects currency → [src/contexts/currency-context.tsx](src/contexts/currency-context.tsx) setCurrency()
2. Fetch rate → [src/services/currency.service.ts](src/services/currency.service.ts) fetchUsdToKesRate()
3. Cache rate → localStorage USD_TO_KES_STORAGE_KEY
4. Components use useCurrency() → formatMoney(amount, currency, rate)
5. Input fields convert KES ↔ USD as needed

---

## Key Technologies

- **React 19.2.8** - UI framework
- **React Router 8.3.0** - Client-side routing
- **MobX 6.12.3** - State management
- **@deriv/deriv-api 1.0.15** - Trading API
- **Blockly 10.4.3** - Visual programming
- **@deriv-com/translations 1.4.7** - i18n
- **@deriv-com/quill-ui 1.18.1** - UI components
- **Formik 2.4.6** - Form management
- **TypeScript** - Type safety
- **RSBuild** - Build tool (faster than Webpack)

---

## Environment Variables

Key configuration via environment variables:

- `NEXT_PUBLIC_DERIV_APP_ID` - OAuth app ID
- `NEXT_PUBLIC_APP_BUILD` - Preview mode detection
- `NEXT_PUBLIC_APP_BASE_PATH` - Router basename for standalone deploys
- `.env` file or build-time configuration

---

## Notes for Developers

1. **Add new stores** → Extend RootStore in [src/stores/root-store.ts](src/stores/root-store.ts)
2. **Add new pages** → Create in [src/pages/](src/pages/) and add route to main.tsx
3. **Add new trade types** → Update config.ts TRADE_TYPE_CATEGORIES
4. **New API calls** → Use api_base.api from @/external/bot-skeleton
5. **Component reactivity** → Wrap with observer() and use useStore()
6. **Global styles** → [src/styles/](src/styles/) main.scss

