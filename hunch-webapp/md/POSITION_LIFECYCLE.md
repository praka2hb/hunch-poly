# Position Lifecycle Accounting

## Data Model (Positions)

Each position represents a single exposure lifecycle (0 -> non-zero -> 0).

Required fields:
- position_id (UUID)
- user_id
- market_id (marketTicker)
- status (OPEN | CLOSED)
- opened_at
- closed_at
- avg_entry_price
- net_quantity
- realized_pnl

Trades are immutable and always the source of truth.

## Trade -> Position Algorithm (Step-by-step)

1) Start a database transaction.
2) Lookup an OPEN position for (user_id, market_id, side).
3) If no OPEN position exists:
   - If trade is BUY: create a new position with net_quantity = 0, avg_entry_price = 0, realized_pnl = 0.
   - If trade is SELL: reject (cannot sell without an open position).
4) Apply the trade to the OPEN position:
   - BUY:
     - Increase net_quantity.
     - Recompute avg_entry_price using weighted average.
   - SELL:
     - Decrease net_quantity.
     - Increase realized_pnl by (sell_proceeds - avg_entry_price * quantity_sold).
5) If net_quantity becomes 0:
   - Mark position as CLOSED and set closed_at.
6) Create the trade row, referencing the position_id.
7) Commit the transaction.

## TypeScript-style Pseudocode

```typescript
type Trade = {
  userId: string;
  marketId: string;
  side: "yes" | "no";
  action: "BUY" | "SELL";
  tokens: number; // quantity in base units
  usdc: number;   // USDC paid/received in base units
  createdAt: Date;
};

type Position = {
  id: string;
  status: "OPEN" | "CLOSED";
  avgEntryPrice: number;
  netQuantity: number;
  realizedPnL: number;
  openedAt: Date;
  closedAt: Date | null;
};

const EPS = 1e-9;

function handleBuy(position: Position, tokensReceived: number, usdcSpent: number) {
  const newQty = position.netQuantity + tokensReceived;
  const newAvg =
    newQty > 0
      ? (position.avgEntryPrice * position.netQuantity + usdcSpent) / newQty
      : position.avgEntryPrice;

  position.netQuantity = newQty;
  position.avgEntryPrice = newAvg;
  position.status = "OPEN";
  position.closedAt = null;
}

function handleSell(position: Position, tokensSold: number, usdcReceived: number) {
  if (tokensSold > position.netQuantity + EPS) {
    throw new Error("Sell exceeds open quantity");
  }

  const costBasisSold = position.avgEntryPrice * tokensSold;
  const realizedDelta = usdcReceived - costBasisSold;
  const newQty = position.netQuantity - tokensSold;

  position.realizedPnL += realizedDelta;
  position.netQuantity = newQty <= EPS ? 0 : newQty;

  if (position.netQuantity === 0) {
    position.status = "CLOSED";
    position.closedAt = new Date();
  }
}

function processTrade(trade: Trade) {
  let position = findOpenPosition(trade.userId, trade.marketId, trade.side);

  if (!position) {
    if (trade.action === "SELL") throw new Error("No open position to sell");
    position = createPosition({
      userId: trade.userId,
      marketId: trade.marketId,
      side: trade.side,
      status: "OPEN",
      netQuantity: 0,
      avgEntryPrice: 0,
      realizedPnL: 0,
      openedAt: trade.createdAt,
    });
  }

  if (trade.action === "BUY") {
    handleBuy(position, trade.tokens, trade.usdc);
  } else {
    handleSell(position, trade.tokens, trade.usdc);
  }

  if (position.netQuantity === 0) {
    position.status = "CLOSED";
    position.closedAt = trade.createdAt;
  }

  savePosition(position);
  createTradeRow(trade, position.id);
}
```

### Partial Close
Partial close is any SELL that leaves net_quantity > 0. The position remains OPEN.

### Full Close
Full close is any SELL that leaves net_quantity == 0. The position becomes CLOSED and is never reused.

## Why Closed Positions Are Never Reused

- Trades always link to exactly one position_id.
- The position lookup only selects status = OPEN.
- Once net_quantity reaches 0, the position is marked CLOSED and excluded from future trade matching.
- Any new exposure in the same market creates a brand new position row with a new UUID.
