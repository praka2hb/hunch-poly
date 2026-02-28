Here's a detailed prompt for implementing trade placement in your Expo mobile app, based on your `WithdrawModal` pattern:

## Mobile App Trade Placement Implementation Prompt

**Objective**: Create a trade placement modal/screen in Expo React Native that mirrors the web app's `WithdrawModal` functionality for placing prediction market trades.

### 1. **Component Structure**
Create a `TradeModal` component with the following state management:

```typescript
interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  marketTicker: string;
  eventTicker?: string;
  userBalance: number;
  currentUserId: string;
  walletAddress: string;
}

// State variables needed:
const [side, setSide] = useState<'yes' | 'no'>('yes');
const [amount, setAmount] = useState('');
const [quote, setQuote] = useState(''); // Optional prediction comment
const [loading, setLoading] = useState(false);
const [status, setStatus] = useState<{type: 'success' | 'error' | 'info'; message: string} | null>(null);
```

### 2. **API Endpoint & Request Body**

**Endpoint to hit:**
```
POST {BASE_URL}/api/trades
```

**Request Headers:**
```typescript
{
  'Content-Type': 'application/json'
}
```

**Request Body:**
```typescript
{
  marketTicker: string;        // e.g., "TRUMP2024"
  eventTicker?: string;        // e.g., "ELECTION2024"  
  side: 'yes' | 'no';         // User's prediction side
  amount: number;             // Bet amount in dollars
  quote?: string;             // Optional user comment/prediction
  userId: string;             // Current user ID
  walletAddress: string;      // User's wallet address
  isDummy: true               // Since using dummy data
}
```

**Example Request:**
```typescript
{
  "marketTicker": "TRUMP2024",
  "eventTicker": "ELECTION2024",
  "side": "yes",
  "amount": 50.0,
  "quote": "Based on recent polls, I think Trump has strong momentum",
  "userId": "user_123abc",
  "walletAddress": "ABC123...XYZ789",
  "isDummy": true
}
```

### 3. **Trade Placement Handler**
Implement the core trade function similar to `handleWithdraw`:

```typescript
const handlePlaceTrade = async () => {
  if (!validateTradeInputs()) return;

  setLoading(true);
  setStatus({ type: 'info', message: 'Placing trade...' });

  try {
    const response = await fetch(`${API_BASE_URL}/api/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketTicker,
        eventTicker,
        side,
        amount: parseFloat(amount),
        quote: quote.trim() || null,
        userId: currentUserId,
        walletAddress,
        isDummy: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to place trade');
    }

    const trade = await response.json();
    setStatus({ type: 'success', message: 'Trade placed successfully!' });
    
    // Reset form after 2 seconds
    setTimeout(() => {
      setAmount('');
      setQuote('');
      onTradeSuccess?.(trade);
    }, 2000);

  } catch (error: any) {
    console.error('Trade placement error:', error);
    
    let errorMessage = 'Failed to place trade';
    if (error.message.includes('insufficient')) {
      errorMessage = 'Insufficient balance';
    } else if (error.message.includes('market')) {
      errorMessage = 'Market not available';
    } else if (error.message.includes('network')) {
      errorMessage = 'Network error - try again';
    }
    
    setStatus({ type: 'error', message: errorMessage });
  } finally {
    setLoading(false);
  }
};
```

### 4. **Input Validation**
```typescript
const validateTradeInputs = (): boolean => {
  setStatus(null);

  if (!amount || parseFloat(amount) <= 0) {
    setStatus({ type: 'error', message: 'Enter valid amount' });
    return false;
  }

  const betAmount = parseFloat(amount);
  if (betAmount > userBalance) {
    setStatus({ type: 'error', message: `Insufficient balance ($${userBalance})` });
    return false;
  }

  if (betAmount < 1) {
    setStatus({ type: 'error', message: 'Minimum $1 bet required' });
    return false;
  }

  return true;
};
```

### 5. **UI Components Needed**

**Main Form Elements:**
- **Side Selector**: Toggle buttons for "Yes" / "No" prediction
- **Amount Input**: Number input with USD currency
- **Quote Input**: Optional text area for user's prediction reasoning
- **Balance Display**: Show available balance with "MAX" button
- **Submit Button**: "Place Trade" with loading spinner

**Status Display:**
- Success/Error/Info messages (like withdraw modal)
- Link to view trade details on success

### 6. **React Native Specific Considerations**

**For React Native/Expo:**
- Use `Modal` from React Native instead of `createPortal`
- Use `TextInput` components with proper keyboard types
- Implement proper focus management and keyboard dismissal
- Use `ActivityIndicator` for loading states
- Handle safe area insets for modal positioning

### 7. **Expected API Response**

**Success Response (201):**
```typescript
{
  id: "trade_abc123",
  userId: "user_123abc",
  marketTicker: "TRUMP2024",
  eventTicker: "ELECTION2024",
  side: "yes",
  amount: "50.0",
  quote: "Based on recent polls...",
  transactionSig: null,
  isDummy: true,
  createdAt: "2024-12-16T10:30:00Z",
  user: {
    id: "user_123abc",
    displayName: "@johndoe",
    avatarUrl: "https://...",
    walletAddress: "ABC123...XYZ789"
  }
}
```

**Error Response (400/500):**
```typescript
{
  error: "Insufficient balance" | "Market not found" | "Invalid input"
}
```

### 8. **Post-Trade Actions**
After successful trade:
- Update local user balance: `userBalance - betAmount`
- Add trade to user's trades list
- Refresh social feed to show new trade
- Navigate to market details or trade confirmation screen
- Show success toast with trade details

### 9. **Integration Points**
- **Portfolio**: Update user's active positions
- **Social Feed**: New trade appears in feed
- **Market View**: Update market probabilities/stats
- **User Profile**: Update trade count and P&L

This implementation follows your exact `WithdrawModal` pattern but adapted for trade placement with dummy data instead of real Solana transactions.