# API Reference

Quick reference for all backend API endpoints.

## Base URL
- **Development:** `http://YOUR_LOCAL_IP:3000`
- **Production:** `https://your-production-domain.com`

---

## Users

### Sync User
```http
POST /api/users/sync
Content-Type: application/json

{
  "privyId": "string",
  "walletAddress": "string",
  "displayName": "string (optional)",
  "avatarUrl": "string (optional)"
}
```

### Get User by ID
```http
GET /api/users/[userId]
```

### Search Users
```http
GET /api/users/search?q=query
```

### Batch Get Users
```http
POST /api/users/batch
Content-Type: application/json

{
  "userIds": ["id1", "id2", ...]
}
```

---

## Feed

### Get Social Feed
```http
GET /api/feed?userId=xxx&mode=following|global&limit=50&offset=0
```

**Query Parameters:**
- `userId` (optional): User ID for personalized feed
- `mode` (optional): `following` or `global` (default: `following`)
- `limit` (optional): Number of items (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
[
  {
    "id": "string",
    "userId": "string",
    "marketTicker": "string",
    "eventTicker": "string | null",
    "side": "yes | no",
    "amount": "string",
    "transactionSig": "string",
    "quote": "string | null",
    "createdAt": "ISO date string",
    "user": {
      "id": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null",
      "walletAddress": "string"
    }
  }
]
```

---

## Trades

### Create Trade
```http
POST /api/trades
Content-Type: application/json

{
  "userId": "string",
  "marketTicker": "string",
  "eventTicker": "string (optional)",
  "side": "yes | no",
  "amount": "string",
  "transactionSig": "string",
  "quote": "string (optional, max 280 chars)",
  "entryPrice": "number (optional)"
}
```

### Get User Trades
```http
GET /api/trades?userId=xxx&limit=50&offset=0
```

**Query Parameters:**
- `userId` (required): User ID
- `limit` (optional): Number of trades (default: 50)
- `offset` (optional): Pagination offset (default: 0)

### Update Trade Quote
```http
PATCH /api/trades
Content-Type: application/json

{
  "tradeId": "string",
  "quote": "string (max 280 chars)",
  "userId": "string"
}
```

---

## Follow

### Follow User
```http
POST /api/follow
Content-Type: application/json

{
  "followerId": "string",
  "followingId": "string"
}
```

### Unfollow User
```http
DELETE /api/follow
Content-Type: application/json

{
  "followerId": "string",
  "followingId": "string"
}
```

### Get Followers
```http
GET /api/follow/followers?userId=xxx
```

### Get Following
```http
GET /api/follow/following?userId=xxx
```

---

## Positions

### Get User Positions
```http
GET /api/positions?userId=xxx
```

---

## Markets (External API)

**Base URL:** `https://dev-prediction-markets-api.dflow.net` (or production URL)

### Get Markets
```http
GET /api/v1/markets?limit=200
```

### Get Market Details
```http
GET /api/v1/market/[ticker]
```

### Get Events
```http
GET /api/v1/events?limit=500&status=open&cursor=xxx&withNestedMarkets=true
```

**Query Parameters:**
- `limit` (optional): Number of events (default: 500)
- `status` (optional): Filter by status (`open`, `closed`, etc.)
- `cursor` (optional): Pagination cursor
- `withNestedMarkets` (optional): Include nested markets

### Get Event Details
```http
GET /api/v1/event/[eventTicker]?withNestedMarkets=true
```

### Batch Get Markets
```http
POST /api/v1/markets/batch
Content-Type: application/json

{
  "mints": ["mint1", "mint2", ...]
}
```

### Filter Outcome Mints
```http
POST /api/v1/filter_outcome_mints
Content-Type: application/json

{
  "addresses": ["addr1", "addr2", ...]
}
```

### Get Event Candlesticks
```http
GET /api/v1/event/[eventTicker]/candlesticks?startTs=xxx&endTs=xxx&periodInterval=3600
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message"
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

---

## Authentication

Currently, the API does not require authentication tokens. User identification is done via:
- `userId` parameter in requests
- User sync via Privy ID and wallet address

For authenticated endpoints, include user context in the request body or query parameters.

---

## Rate Limiting

- API endpoints may have rate limiting in production
- Use appropriate caching strategies
- Implement exponential backoff for retries

---

## Caching

Some endpoints support caching:
- Feed endpoints cache for 10 seconds
- User endpoints cache for 3 seconds
- Use `Cache-Control: no-cache` header to bypass cache

