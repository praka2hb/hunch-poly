Here's the **complete trade flow** (buy, sell, withdraw/redeem) with all endpoints and logic:

---

## IMPORTANT: Sponsored Order Flow

All orders **MUST** go through your Next.js backend at `/api/dflow/quote`. The backend:
1. Requests the order from DFlow with `sponsor` set
2. Signs the transaction with `SPONSOR_PRIVATE_KEY`
3. Returns the **sponsor-signed** transaction

**Never call DFlow directly for orders** - the transaction won't have the sponsor signature and will fail on-chain.

---

## 1. PLACING A TRADE (BUY)

### Frontend Flow

**Step 1: Get sponsor-signed order from backend**
```typescript
import { requestOrder, executeTrade, USDC_MINT, toRawAmount } from '@/lib/tradeService';

// Convert human amount to smallest unit
const rawAmount = toRawAmount(100, 6); // $100 → "100000000"

// User enters amount, clicks "Buy Yes" or "Buy No"
const order = await requestOrder({
  userPublicKey: walletAddress,
  inputMint: USDC_MINT,  // "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  outputMint: outcomeMint, // yesMint or noMint from market.accounts
  amount: rawAmount,  // Raw amount (100 USDC = "100000000" in smallest unit)
  slippageBps: 100  // 1% slippage (recommended)
});
// ⚠️ The returned transaction is ALREADY sponsor-signed!
```

**Backend endpoint hit:**
```
GET /api/dflow/quote?userPublicKey=...&inputMint=USDC&outputMint=OUTCOME_MINT&amount=100000000&slippageBps=100
```

**Response:**
```json
{
  "transaction": "base64_encoded_transaction_bytes (SPONSOR-SIGNED)",
  "executionMode": "sync",  // or "async"
  "inAmount": "100000000",  // USDC spent
  "outAmount": "153846153",  // Tokens received
  "inputMint": "EPjFWdd5...",
  "outputMint": "ABC123...",
  "lastValidBlockHeight": 123456,
  "prioritizationFeeLamports": 5000,
  "computeUnitLimit": 200000
}
```

---

**Step 2: User signs (sign-only) and send**
```typescript
import { deserializeTransaction, signAndSendWithPrivy } from '@/lib/tradeService';

// Decode base64 → VersionedTransaction (sponsor already signed)
const transaction = deserializeTransaction(order.transaction);

// User signs with Privy (signTransaction, NOT signAndSendTransaction)
// Then we send with our RPC (skipPreflight: true, maxRetries: 3)
const signature = await signAndSendWithPrivy(provider, transaction, connection);
```

**Or use the all-in-one function with retry:**
```typescript
// Recommended: Uses executeTrade which handles the full flow with retry
const { signature, order } = await executeTrade({
  provider,
  connection,
  userPublicKey: backendUser.walletAddress,
  inputMint: USDC_MINT,
  outputMint: outcomeMint,
  amount: rawAmount,
  slippageBps: 100,
  maxRetries: 2, // Auto-retry with fresh quote on blockhash expiry
});
```

---

**Step 3: Wait for confirmation**

**If executionMode = "sync":**
- Transaction is already confirmed by the time it returns
- No additional waiting needed

**If executionMode = "async":**
- `executeTrade` handles this automatically
- Or poll manually:
```typescript
const maxAttempts = 20;
let attempts = 0;
while (attempts < maxAttempts) {
  const status = await getOrderStatus(signature);
  if (status.status === 'closed') break;
  if (status.status === 'failed') throw new Error('Execution failed');
  attempts++;
  await sleep(1500);
}
```

**Backend endpoint:**
```
GET /api/dflow/order-status?signature=TRANSACTION_SIG
```

**Response:**
```json
{
  "status": "closed",  // or "open", "pendingClose", "failed"
  "fills": [
    {
      "qtyIn": "100000000",
      "qtyOut": "153846153"
    }
  ]
}
```

---

**Step 4: Save trade to database**
```typescript
await fetch('/api/trades', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: currentUserId,
    marketTicker: "MKT-001",
    eventTicker: "EVENT-001",
    side: "yes",  // or "no"
    action: "BUY",
    amount: "100.00",  // Human-readable USDC spent
    executedInAmount: order.inAmount,   // "100000000"
    executedOutAmount: order.outAmount, // "153846153"
    transactionSig: signature,
  }),
});
```

**Backend logic in `/api/trades` POST:**

[1 tool called]

```typescript
// In tradeService.ts - createTrade() calls upsertPositionForTrade()
```

**DB logic for BUY:**

```43:86:c:\hunchdotrun\app\lib\tradeService.ts
async function upsertPositionForTrade(...) {
  // Find or create position
  let position = await prisma.position.findUnique({
    where: { userId_marketTicker_side: { userId, marketTicker, side } }
  });

  if (!position) {
    position = await prisma.position.create({
      data: { userId, marketTicker, eventTicker, side, status: 'OPEN' }
    });
  }

  // Calculate amounts in human-readable form (divide by 1M)
  if (action === 'BUY') {
    // BUY: inAmount = USDC spent, outAmount = tokens received
    const usdcSpent = executedInAmount ? Number(executedInAmount) / DECIMALS : 0;
    const tokensReceived = executedOutAmount ? Number(executedOutAmount) / DECIMALS : 0;

    if (usdcSpent > 0 && tokensReceived > 0) {
      await prisma.position.update({
        where: { id: position.id },
        data: {
          totalCostBasis: { increment: usdcSpent },
          totalTokensBought: { increment: tokensReceived },
          status: 'OPEN'
        }
      });
    }
  }
  ...
}
```

**What gets saved:**
- `Trade` record with signature
- `Position` updated:
  - `totalCostBasis += 100` (USDC)
  - `totalTokensBought += 153.846` (tokens)
  - `status = 'OPEN'`

---

## 2. SELLING A TRADE (SELL)

### Frontend Flow

**Step 1: Get current position balance (on-chain)**
```typescript
// Already have from /api/positions response:
position.totalTokenAmount = 153.846 // Current on-chain balance
```

**Step 2: Get quote/order from DFlow**
```typescript
const amountRaw = Math.floor(position.totalTokenAmount * 1_000_000).toString(); // "153846000"

const order = await requestOrder({
  userPublicKey: walletAddress,
  inputMint: outcomeMint,  // yesMint or noMint (what you're selling)
  outputMint: USDC_MINT,   // What you're getting back
  amount: amountRaw,       // Raw token amount
  slippageBps: 100
});
```

**Backend endpoint:**
```
GET /api/dflow/quote?userPublicKey=...&inputMint=OUTCOME_MINT&outputMint=USDC&amount=153846000&slippageBps=100
```

**Response:** (same structure as BUY)
```json
{
  "transaction": "base64...",
  "executionMode": "sync",
  "inAmount": "153846000",   // Tokens sold
  "outAmount": "98500000",   // USDC received (might be less due to price movement)
  ...
}
```

---

**Step 3: Sign, send, wait for confirmation** (same as BUY)

---

**Step 4: Save sell trade to database**
```typescript
await fetch('/api/trades', {
  method: 'POST',
  body: JSON.stringify({
    userId: currentUserId,
    marketTicker: position.marketTicker,
    eventTicker: position.market?.eventTicker || null,
    side: position.side,
    action: 'SELL',
    amount: receivedUsdc.toFixed(2),  // "98.50"
    executedInAmount: order.inAmount,   // "153846000" (tokens sold)
    executedOutAmount: order.outAmount, // "98500000" (USDC received)
    transactionSig: signature,
  }),
});
```

**DB logic for SELL:**

```87:136:c:\hunchdotrun\app\lib\tradeService.ts
  } else if (action === 'SELL') {
    // SELL: inAmount = tokens sold, outAmount = USDC received
    const tokensSold = executedInAmount ? Number(executedInAmount) / DECIMALS : 0;
    const usdcReceived = executedOutAmount ? Number(executedOutAmount) / DECIMALS : 0;

    if (tokensSold > 0 && usdcReceived > 0) {
      // Refresh position to get latest values
      position = await prisma.position.findUnique({
        where: { id: position.id }
      });

      if (position.totalTokensBought > 0) {
        // Calculate average cost per token
        const avgCostPerToken = position.totalCostBasis / position.totalTokensBought;

        // Cost basis for tokens being sold
        const costBasisSold = avgCostPerToken * tokensSold;

        // Realized PnL for this sell
        const realizedPnLThisSell = usdcReceived - costBasisSold;

        // Calculate new status
        const newTotalTokensSold = position.totalTokensSold + tokensSold;
        const remainingTokens = position.totalTokensBought - newTotalTokensSold;

        let newStatus = 'OPEN';
        let closedAt = null;
        if (remainingTokens <= 0.0001) { // Small tolerance for floating point
          newStatus = 'CLOSED';
          closedAt = new Date();
        } else if (newTotalTokensSold > 0) {
          newStatus = 'PARTIALLY_CLOSED';
        }

        await prisma.position.update({
          where: { id: position.id },
          data: {
            totalTokensSold: { increment: tokensSold },
            totalSellProceeds: { increment: usdcReceived },
            realizedPnL: { increment: realizedPnLThisSell },
            status: newStatus,
            closedAt: closedAt
          }
        });
      }
    }
  }
```

**Example calculation:**
- User bought 153.846 tokens for $100
- Average cost per token = $100 / 153.846 = $0.65
- User sells all 153.846 tokens for $98.50
- Cost basis sold = $0.65 × 153.846 = $100
- **Realized PnL = $98.50 - $100 = -$1.50** (loss)
- Status changes to `CLOSED`

**What gets saved:**
- `Trade` record with action='SELL'
- `Position` updated:
  - `totalTokensSold += 153.846`
  - `totalSellProceeds += 98.50`
  - `realizedPnL += -1.50`
  - `status = 'CLOSED'`
  - `closedAt = now()`

---

## 3. REDEEM/WITHDRAW (Winning Position)

**When to use:** Market is finalized/determined, and user's side won.

### Frontend Flow

**Step 1: Check if redeemable**
```typescript
const { eligible, settlementMint, reason } = await getRedeemEligibility();

function getRedeemEligibility() {
  const outcomeMint = getOutcomeMintForSide(); // yesMint or noMint
  
  // Fetch fresh market data
  const market = await fetchMarketByMint(outcomeMint);
  const status = market.status.toLowerCase();
  
  // Must be determined or finalized
  if (status !== 'determined' && status !== 'finalized') {
    return { eligible: false, settlementMint: null, reason: 'Market not determined' };
  }

  // Find settlement account with redemptionStatus = 'open'
  const accounts = market.accounts;
  const usdcAcct = accounts[USDC_MINT];
  
  if (usdcAcct?.redemptionStatus !== 'open') {
    return { eligible: false, settlementMint: null, reason: 'Redemption not open' };
  }

  // Check if user's side won
  const result = market.result; // "yes" or "no"
  const userWon = (result === position.side);
  
  if (!userWon) {
    return { eligible: false, settlementMint: null, reason: 'Not the winning side' };
  }

  return { eligible: true, settlementMint: USDC_MINT };
}
```

---

**Step 2: Request redemption order**
```typescript
const amountRaw = Math.floor(position.totalTokenAmount * 1_000_000).toString();

const order = await requestOrder({
  userPublicKey: walletAddress,
  inputMint: outcomeMint,        // Winning side mint
  outputMint: settlementMint,    // USDC (settlement mint)
  amount: amountRaw,
  slippageBps: 100
});
```

**Backend endpoint:** (same as SELL)
```
GET /api/dflow/quote?userPublicKey=...&inputMint=OUTCOME_MINT&outputMint=USDC&amount=...&slippageBps=100
```

**Response:** (same structure)

---

**Step 3: Sign, send, confirm** (same as BUY/SELL)

---

**Step 4: Optional - save as SELL trade**
```typescript
// Redemption is just a special type of sell
// Frontend typically doesn't save this to DB in current implementation
// But you could add it similar to SELL flow
```

---

## 4. GET USER POSITIONS (to show portfolio)

**Request:**
```
GET /api/positions?userId=USER_ID&includeStats=true
```

**Response:**
```json
{
  "positions": {
    "active": [
      {
        "marketTicker": "MKT-001",
        "eventTicker": "EVENT-001",
        "side": "yes",
        "totalTokenAmount": 153.846,      // On-chain balance
        "totalCostBasis": 100.00,         // From DB
        "totalTokensBought": 153.846,     // From DB
        "totalTokensSold": 0,             // From DB
        "totalSellProceeds": 0,           // From DB
        "realizedPnL": 0,                 // From DB
        "unrealizedPnL": 3.08,            // Calculated: currentValue - remainingCostBasis
        "totalPnL": 3.08,                 // realizedPnL + unrealizedPnL
        "currentPrice": 0.67,             // From market API
        "currentValue": 103.08,           // totalTokenAmount * currentPrice
        "averageEntryPrice": 0.65,        // totalCostBasis / totalTokensBought
        "profitLoss": 3.08,               // Same as totalPnL
        "profitLossPercentage": 3.08,     // (totalPnL / totalCostBasis) * 100
        "positionStatus": "OPEN",
        "tradeCount": 1,
        "market": { /* market data */ },
        "eventImageUrl": "https://..."
      }
    ],
    "previous": [
      {
        "marketTicker": "MKT-002",
        "side": "no",
        "totalTokenAmount": 0,            // Sold all
        "totalCostBasis": 50.00,
        "totalTokensBought": 100.00,
        "totalTokensSold": 100.00,
        "totalSellProceeds": 45.00,
        "realizedPnL": -5.00,             // Lost $5
        "unrealizedPnL": 0,               // No tokens left
        "totalPnL": -5.00,
        "positionStatus": "CLOSED",
        ...
      }
    ]
  },
  "stats": {
    "totalProfitLoss": -1.92,
    "totalPositions": 2,
    "activePositions": 1,
    "winningPositions": 1,
    "losingPositions": 1,
    "winRate": 50
  }
}
```

---

## Summary: All Endpoints

| Action | Endpoint | Method | Purpose |
|--------|----------|--------|---------|
| **Get quote (buy/sell/redeem)** | `/api/dflow/quote` | GET | Get transaction for trade |
| **Check order status** | `/api/dflow/order-status` | GET | Poll async order status |
| **Save trade** | `/api/trades` | POST | Store trade + update position |
| **Get positions** | `/api/positions` | GET | Fetch portfolio with PnL |
| **Get trades history** | `/api/trades` | GET | Fetch user's trade history |

Want me to provide **Postman collection** or **mobile SDK pseudocode** for this?