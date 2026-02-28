# Quick Start Guide

Get your Expo app connected to the backend in 5 minutes.

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] pnpm installed (`npm install -g pnpm`)
- [ ] PostgreSQL database running
- [ ] Redis instance (or Upstash account)
- [ ] Privy App ID from [dashboard.privy.io](https://dashboard.privy.io)
- [ ] Expo CLI installed (`npm install -g expo-cli`)

---

## Backend Setup (2 minutes)

### 1. Install & Configure

```bash
cd /Users/vighneshs/hunchdotrun
pnpm install
```

### 2. Set Environment Variables

Create `.env.local`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/hunchdb"
NEXT_PUBLIC_PRIVY_APP_ID="your_privy_app_id"
UPSTASH_REDIS_REST_URL="your_redis_url"
UPSTASH_REDIS_REST_TOKEN="your_redis_token"
```

### 3. Setup Database

```bash
pnpm db:migrate
pnpm db:generate
```

### 4. Start Server

```bash
pnpm dev
```

**Note:** Server runs on `http://0.0.0.0:3000`. Find your local IP:
- macOS: `ifconfig | grep "inet " | grep -v 127.0.0.1`
- Windows: `ipconfig`

---

## Expo Frontend Setup (3 minutes)

### 1. Create Expo App

```bash
npx create-expo-app@latest hunch-mobile --template blank-typescript
cd hunch-mobile
```

### 2. Install Dependencies

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens
npm install @privy-io/react-native axios @react-native-async-storage/async-storage
```

### 3. Configure Environment

Create `.env`:

```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000
EXPO_PUBLIC_PRIVY_APP_ID=your_privy_app_id
```

### 4. Copy Setup Files

Copy the following from `EXPO_SETUP_GUIDE.md`:
- `lib/api.ts` - API client
- `components/AuthProvider.tsx` - Auth provider
- `app/_layout.tsx` - Root layout
- `app/(tabs)/_layout.tsx` - Tab layout
- `app/(tabs)/index.tsx` - Home screen

### 5. Start Expo

```bash
npx expo start
```

Scan QR code with Expo Go app or press `i`/`a` for simulators.

---

## Test Connection

### Backend Test

```bash
curl http://localhost:3000/api/feed?mode=global&limit=10
```

Should return JSON array of feed items.

### Frontend Test

1. Open app in Expo Go
2. Tap login button
3. Authenticate with Twitter/Google
4. Verify feed loads

---

## Common Issues

### ❌ CORS Errors
**Fix:** Already configured in `next.config.ts`. Make sure you're using your local IP, not `localhost`.

### ❌ Network Request Failed
**Fix:** 
- Ensure phone and computer are on same WiFi
- Check firewall settings
- Verify API URL in `.env` matches your local IP

### ❌ Privy Auth Not Working
**Fix:**
- Verify `EXPO_PUBLIC_PRIVY_APP_ID` matches backend
- Check Privy dashboard has correct bundle IDs
- Ensure OAuth providers are configured

### ❌ Database Connection Error
**Fix:**
- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env.local`
- Run `pnpm db:push` to sync schema

---

## Next Steps

1. ✅ Backend running on `http://YOUR_IP:3000`
2. ✅ Expo app connected and authenticated
3. 📱 Implement remaining screens (see `EXPO_SETUP_GUIDE.md`)
4. 🚀 Deploy backend to production
5. 📦 Build and submit to app stores

---

## File Structure Reference

```
hunchdotrun/                    # Backend
├── app/
│   ├── api/                   # API routes
│   ├── components/            # React components
│   └── lib/                   # Utilities
├── prisma/
│   └── schema.prisma          # Database schema
└── next.config.ts             # Next.js config

hunch-mobile/                   # Expo Frontend
├── app/                       # Expo Router pages
├── components/                # React Native components
├── lib/                       # API client & utilities
└── .env                       # Environment variables
```

---

## Documentation

- **Full Setup Guide:** `EXPO_SETUP_GUIDE.md`
- **API Reference:** `API_REFERENCE.md`
- **Backend Code:** See `app/api/` directory
- **Privy Docs:** [docs.privy.io](https://docs.privy.io)
- **Expo Docs:** [docs.expo.dev](https://docs.expo.dev)

---

## Support

If you encounter issues:
1. Check error messages in terminal/console
2. Verify all environment variables are set
3. Ensure all dependencies are installed
4. Review the full setup guide for detailed instructions

