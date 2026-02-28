Reviewing the codebase to identify API endpoints, request bodies, and response formats.

Key_ID_APN= M34UGY4AYF

[3 tools called]


Reading the API route files to understand request/response formats:


[7 tools called]


Checking service files for response data structures:


[3 tools called]


Backend API documentation for Expo React Native integration:

## Backend API Documentation

### Base URL
Use your Next.js backend URL (e.g., `https://your-domain.com` or `http://localhost:3000` for development).

---

## 1. User Endpoints

### POST `/api/users/sync`
Sync or create a user from Privy auth.

**Request Body:**
```json
{
  "privyId": "string (required)",
  "walletAddress": "string (required)",
  "displayName": "string (optional)",
  "avatarUrl": "string (optional)"
}
```

**Response (200):**
```json
{
  "id": "string",
  "privyId": "string",
  "walletAddress": "string",
  "displayName": "string | null",
  "avatarUrl": "string | null",
  "followerCount": 0,
  "followingCount": 0,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "_count": {
    "trades": 0
  }
}
```

**Error Responses:**
- `400`: `{ "error": "privyId and walletAddress are required" }`
- `500`: `{ "error": "error message" }`

---

### POST `/api/users/push-token`
Register or update Expo Push Token for push notifications. Requires authentication.

**Request Body:**
```json
{
  "expoPushToken": "string (required)"
}
```

- Validates `expoPushToken` is a string and passes `Expo.isExpoPushToken()`
- `userId` is derived from session via `getAuthenticatedUser()` (Privy JWT)

**Response (200):** Empty or success object.

**Error Responses:**
- `401`: Unauthorized
- `500`: `{ "error": "error message" }`

---

### DELETE `/api/users/push-token`
Remove push token (logout/opt-out). Requires authentication.

**Response (200):** Empty or success object.

**Error Responses:**
- `401`: Unauthorized
- `500`: `{ "error": "error message" }`

---

### GET `/api/users/[userId]`
Get user profile by ID.

**Request:**
- URL Parameter: `userId` (string)

**Response (200):**
```json
{
  "id": "string",
  "privyId": "string",
  "walletAddress": "string",
  "displayName": "string | null",
  "avatarUrl": "string | null",
  "followerCount": 0,
  "followingCount": 0,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "_count": {
    "trades": 0
  }
}
```

**Error Responses:**
- `400`: `{ "error": "User ID is required" }`
- `404`: `{ "error": "User not found" }`
- `500`: `{ "error": "error message" }`

---

### GET `/api/users/search`
Search users by display name or wallet address.

**Query Parameters:**
- `q` (string, optional): Search query for display name or wallet address
- `walletAddress` (string, optional): Exact wallet address search
- `type` (string, optional): Filter type - `"displayName"` or `"walletAddress"`

**Request Examples:**
- `GET /api/users/search?q=john`
- `GET /api/users/search?walletAddress=0x123...`
- `GET /api/users/search?q=john&type=displayName`

**Response (200):**
```json
[
  {
    "id": "string",
    "privyId": "string",
    "walletAddress": "string",
    "displayName": "string | null",
    "avatarUrl": "string | null",
    "followerCount": 0,
    "followingCount": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "_count": {
      "trades": 0
    }
  }
]
```

**Error Responses:**
- `400`: `{ "error": "Either \"q\" or \"walletAddress\" query parameter is required" }`
- `500`: `{ "error": "error message" }`

---

## 2. Follow Endpoints

### POST `/api/follow`
Follow a user.

**Request Body:**
```json
{
  "followerId": "string (required)",
  "followingId": "string (required)"
}
```

**Response (200):**
```json
{
  "id": "string",
  "followerId": "string",
  "followingId": "string",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "follower": {
    "id": "string",
    "displayName": "string | null",
    "avatarUrl": "string | null",
    "walletAddress": "string"
  },
  "following": {
    "id": "string",
    "displayName": "string | null",
    "avatarUrl": "string | null",
    "walletAddress": "string"
  }
}
```

**Error Responses:**
- `400`: `{ "error": "followerId and followingId are required" }`
- `500`: `{ "error": "error message" }`

**Note:** Returns existing follow relationship if already following.

---

### DELETE `/api/follow`
Unfollow a user.

**Request Body:**
```json
{
  "followerId": "string (required)",
  "followingId": "string (required)"
}
```

**Response (200):**
```json
{
  "success": true
}
```

**Error Responses:**
- `400`: `{ "error": "followerId and followingId are required" }`
- `500`: `{ "error": "error message" }`

---

### GET `/api/follow/following`
Get list of users being followed.

**Query Parameters:**
- `userId` (string, required)

**Request Example:**
- `GET /api/follow/following?userId=user123`

**Response (200):**
```json
[
  {
    "id": "string",
    "followerId": "string",
    "followingId": "string",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "follower": {
      "id": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null",
      "walletAddress": "string"
    },
    "following": {
      "id": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null",
      "walletAddress": "string"
    }
  }
]
```

**Error Responses:**
- `400`: `{ "error": "userId is required" }`
- `500`: `{ "error": "error message" }`

---

### GET `/api/follow/followers`
Get list of followers.

**Query Parameters:**
- `userId` (string, required)

**Request Example:**
- `GET /api/follow/followers?userId=user123`

**Response (200):**
```json
[
  {
    "id": "string",
    "followerId": "string",
    "followingId": "string",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "follower": {
      "id": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null",
      "walletAddress": "string"
    },
    "following": {
      "id": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null",
      "walletAddress": "string"
    }
  }
]
```

**Error Responses:**
- `400`: `{ "error": "userId is required" }`
- `500`: `{ "error": "error message" }`

---

## 3. Trade Endpoints

### POST `/api/trades`
Create a new trade.

**Request Body:**
```json
{
  "userId": "string (required)",
  "marketTicker": "string (required)",
  "side": "yes" | "no" (required),
  "amount": "string (required)",
  "transactionSig": "string (required)"
}
```

**Response (201):**
```json
{
  "id": "string",
  "userId": "string",
  "marketTicker": "string",
  "side": "yes",
  "amount": "string",
  "transactionSig": "string",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `400`: `{ "error": "All fields are required: userId, marketTicker, side, amount, transactionSig" }`
- `400`: `{ "error": "side must be either \"yes\" or \"no\"" }`
- `500`: `{ "error": "error message" }`

**Note:** Returns existing trade if `transactionSig` already exists (idempotent).

---

### GET `/api/trades`
Get user's trades.

**Query Parameters:**
- `userId` (string, required)
- `limit` (number, optional, default: 50)
- `offset` (number, optional, default: 0)

**Request Example:**
- `GET /api/trades?userId=user123&limit=20&offset=0`

**Response (200):**
```json
[
  {
    "id": "string",
    "userId": "string",
    "marketTicker": "string",
    "side": "yes",
    "amount": "string",
    "transactionSig": "string",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "user": {
      "id": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null",
      "walletAddress": "string"
    }
  }
]
```

**Error Responses:**
- `400`: `{ "error": "userId is required" }`
- `500`: `{ "error": "error message" }`

---

### GET `/api/trades/[tradeId]`
Get a single trade by ID. Used for push notification deep links. Requires authentication.

**Request:**
- URL Parameter: `tradeId` (string)

**Response (200):**
```json
{
  "id": "string",
  "userId": "string",
  "marketTicker": "string",
  "eventTicker": "string | null",
  "side": "yes",
  "action": "BUY",
  "amount": "string",
  "transactionSig": "string",
  "quote": "string | null",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "user": {
    "id": "string",
    "displayName": "string | null",
    "avatarUrl": "string | null",
    "walletAddress": "string"
  }
}
```

**Error Responses:**
- `401`: Unauthorized
- `404`: Trade not found
- `500`: `{ "error": "error message" }`

---

## 4. Feed Endpoint

### GET `/api/feed`
Get social feed (trades from followed users).

**Query Parameters:**
- `userId` (string, required)
- `limit` (number, optional, default: 50)
- `offset` (number, optional, default: 0)

**Request Example:**
- `GET /api/feed?userId=user123&limit=20&offset=0`

**Response (200):**
```json
[
  {
    "id": "string",
    "userId": "string",
    "marketTicker": "string",
    "side": "yes",
    "amount": "string",
    "transactionSig": "string",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "user": {
      "id": "string",
      "displayName": "string | null",
      "avatarUrl": "string | null",
      "walletAddress": "string"
    }
  }
]
```

**Error Responses:**
- `400`: `{ "error": "userId is required" }`
- `500`: `{ "error": "error message" }`

**Note:** Returns empty array if user is not following anyone.

---

## Example React Native Integration

```typescript
// api.ts
const API_BASE_URL = 'https://your-backend-url.com'; // or 'http://localhost:3000' for dev

export const api = {
  // User endpoints
  syncUser: async (data: { privyId: string; walletAddress: string; displayName?: string; avatarUrl?: string }) => {
    const response = await fetch(`${API_BASE_URL}/api/users/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  getUser: async (userId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`);
    return response.json();
  },

  searchUsers: async (query: string) => {
    const response = await fetch(`${API_BASE_URL}/api/users/search?q=${encodeURIComponent(query)}`);
    return response.json();
  },

  // Follow endpoints
  followUser: async (followerId: string, followingId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followerId, followingId }),
    });
    return response.json();
  },

  unfollowUser: async (followerId: string, followingId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/follow`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followerId, followingId }),
    });
    return response.json();
  },

  getFollowing: async (userId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/follow/following?userId=${userId}`);
    return response.json();
  },

  getFollowers: async (userId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/follow/followers?userId=${userId}`);
    return response.json();
  },

  // Trade endpoints
  createTrade: async (data: { userId: string; marketTicker: string; side: 'yes' | 'no'; amount: string; transactionSig: string }) => {
    const response = await fetch(`${API_BASE_URL}/api/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  getUserTrades: async (userId: string, limit = 50, offset = 0) => {
    const response = await fetch(`${API_BASE_URL}/api/trades?userId=${userId}&limit=${limit}&offset=${offset}`);
    return response.json();
  },

  // Feed endpoint
  getFeed: async (userId: string, limit = 50, offset = 0) => {
    const response = await fetch(`${API_BASE_URL}/api/feed?userId=${userId}&limit=${limit}&offset=${offset}`);
    return response.json();
  },
};
```

---

## Notes

1. All endpoints return JSON.
2. Error responses include an `error` field with a message.
3. Dates are ISO 8601 strings.
4. The feed endpoint is cached (45 seconds TTL).
5. User profiles are cached (5 minutes TTL).
6. Follow relationships are cached (10 minutes TTL).
7. All endpoints use standard HTTP status codes (200, 201, 400, 404, 500).

Replace `API_BASE_URL` with your backend URL.