## Market Fetching Overview

Markets are fetched directly from the DFlow Prediction Market Metadata API (external), not from your backend. The backend handles users, follows, trades, and feeds, but not markets.

---

## External API Details

### Base URL
```
https://prediction-markets-api.dflow.net
```

---

## Market Fetching Functions

All market functions are in `app/lib/api.ts`:

### 1. Fetch Markets
```typescript
fetchMarkets(limit: number = 200): Promise<Market[]>
```

**API Endpoint:**
```
GET https://prediction-markets-api.dflow.net/api/v1/markets?limit={limit}
```

**Request:**
- Query Parameter: `limit` (number, default: 200)

**Response:**
```json
{
  "markets": [
    {
      "ticker": "string",
      "title": "string",
      "status": "string",
      "yesMint": "string (optional)",
      "noMint": "string (optional)",
      "volume": "number (optional)",
      "accounts": {
        "yesMint": "string (optional)",
        "noMint": "string (optional)"
      }
    }
  ]
}
```

**Usage Example:**
```typescript
const markets = await fetchMarkets(50);
// Filters out finalized/resolved/closed markets client-side
const activeMarkets = markets.filter(
  market => market.status !== 'finalized' && 
            market.status !== 'resolved' && 
            market.status !== 'closed'
);
```

---

### 2. Fetch Events (with nested markets)
```typescript
fetchEvents(
  limit: number = 200,
  options?: {
    status?: string;
    withNestedMarkets?: boolean;
  }
): Promise<Event[]>
```

**API Endpoint:**
```
GET https://prediction-markets-api.dflow.net/api/v1/events?limit={limit}&status={status}&withNestedMarkets=true
```

**Request:**
- Query Parameters:
  - `limit` (number, default: 200)
  - `status` (string, optional)
  - `withNestedMarkets` (boolean, optional)

**Response:**
```json
{
  "events": [
    {
      "ticker": "string",
      "title": "string",
      "subtitle": "string (optional)",
      "markets": [
        {
          "ticker": "string",
          "title": "string",
          "status": "string",
          "accounts": {
            "yesMint": "string",
            "noMint": "string"
          }
        }
      ]
    }
  ]
}
```

---

### 3. Fetch Event Details
```typescript
fetchEventDetails(eventTicker: string): Promise<EventDetails>
```

**API Endpoint:**
```
GET https://prediction-markets-api.dflow.net/api/v1/event/{eventTicker}?withNestedMarkets=true
```

**Request:**
- URL Parameter: `eventTicker` (string)

**Response:**
```json
{
  "ticker": "string",
  "title": "string",
  "subtitle": "string (optional)",
  "markets": [
    {
      "ticker": "string",
      "title": "string",
      "status": "string",
      "accounts": {
        "yesMint": "string",
        "noMint": "string"
      }
    }
  ]
}
```

---

### 4. Fetch Market by Mint Address
```typescript
fetchMarketByMint(mintAddress: string): Promise<Market>
```

**API Endpoint:**
```
GET https://prediction-markets-api.dflow.net/api/v1/market/by-mint/{mintAddress}
```

**Request:**
- URL Parameter: `mintAddress` (string)

**Response:**
```json
{
  "ticker": "string",
  "title": "string",
  "status": "string",
  "yesMint": "string",
  "noMint": "string",
  "volume": "number",
  "accounts": {
    "yesMint": "string",
    "noMint": "string"
  }
}
```

---

### 5. Fetch Markets Batch (Multiple Mints)
```typescript
fetchMarketsBatch(mints: string[]): Promise<Market[]>
```

**API Endpoint:**
```
POST https://prediction-markets-api.dflow.net/api/v1/markets/batch
```

**Request Body:**
```json
{
  "mints": ["mint1", "mint2", "mint3"]
}
```

**Response:**
```json
{
  "markets": [
    {
      "ticker": "string",
      "title": "string",
      "status": "string",
      "yesMint": "string",
      "noMint": "string"
    }
  ]
}
```

---

### 6. Fetch Events by Series
```typescript
fetchEventsBySeries(
  seriesTickers: string | string[],
  options?: {
    withNestedMarkets?: boolean;
    status?: string;
    limit?: number;
  }
): Promise<Event[]>
```

**API Endpoint:**
```
GET https://prediction-markets-api.dflow.net/api/v1/events?seriesTickers={tickers}&withNestedMarkets=true&status={status}&limit={limit}
```

---

### 7. Filter Outcome Mints
```typescript
filterOutcomeMints(addresses: string[]): Promise<string[]>
```

**API Endpoint:**
```
POST https://prediction-markets-api.dflow.net/api/v1/filter_outcome_mints
```

**Request Body:**
```json
{
  "addresses": ["address1", "address2"]
}
```

**Response:**
```json
{
  "outcomeMints": ["mint1", "mint2"]
}
```

---

## Market Interface

```typescript
interface Market {
  ticker: string;
  title: string;
  status: string; // 'active', 'finalized', 'resolved', 'closed'
  yesMint?: string;
  noMint?: string;
  volume?: number;
  accounts?: {
    yesMint?: string;
    noMint?: string;
    [key: string]: any;
  };
  [key: string]: any; // Other fields may exist
}
```

---

## React Native Integration Example

```typescript
// api/markets.ts
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

export interface Market {
  ticker: string;
  title: string;
  status: string;
  yesMint?: string;
  noMint?: string;
  volume?: number;
  accounts?: {
    yesMint?: string;
    noMint?: string;
  };
}

export interface MarketsResponse {
  markets: Market[];
}

export const marketsApi = {
  // Fetch all markets
  fetchMarkets: async (limit: number = 200): Promise<Market[]> => {
    const response = await fetch(
      `${METADATA_API_BASE_URL}/api/v1/markets?limit=${limit}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch markets: ${response.statusText}`);
    }

    const data: MarketsResponse = await response.json();
    return data.markets || [];
  },

  // Fetch events with nested markets
  fetchEvents: async (
    limit: number = 200,
    options?: {
      status?: string;
      withNestedMarkets?: boolean;
    }
  ) => {
    const queryParams = new URLSearchParams();
    queryParams.append('limit', limit.toString());
    
    if (options?.status) {
      queryParams.append('status', options.status);
    }
    if (options?.withNestedMarkets) {
      queryParams.append('withNestedMarkets', 'true');
    }

    const response = await fetch(
      `${METADATA_API_BASE_URL}/api/v1/events?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }

    const data = await response.json();
    return data.events || [];
  },

  // Fetch market by mint address
  fetchMarketByMint: async (mintAddress: string): Promise<Market> => {
    const response = await fetch(
      `${METADATA_API_BASE_URL}/api/v1/market/by-mint/${mintAddress}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch market by mint: ${response.statusText}`);
    }

    return await response.json();
  },

  // Fetch markets batch
  fetchMarketsBatch: async (mints: string[]): Promise<Market[]> => {
    const response = await fetch(
      `${METADATA_API_BASE_URL}/api/v1/markets/batch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mints }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch markets batch: ${response.statusText}`);
    }

    const data = await response.json();
    return data.markets || [];
  },
};
```

---

## Important Notes

1. No backend proxy: Markets are fetched directly from the external API in the client.
2. CORS: The external API should allow requests from your app.
3. Filtering: Active markets are filtered client-side (exclude `finalized`, `resolved`, `closed`).
4. No authentication: The DFlow API appears to be public (no auth headers found).
5. Rate limiting: Consider caching or rate limiting on the client.

---

## Summary

- Markets: Fetched from `https://prediction-markets-api.dflow.net` (external API)
- Users/Follows/Trades/Feed: Handled by your Next.js backend (`/api/users`, `/api/follow`, `/api/trades`, `/api/feed`)

For Expo React Native, call the DFlow API directly from the client, similar to the web app.