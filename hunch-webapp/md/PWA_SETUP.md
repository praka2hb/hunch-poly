# PWA Setup Guide

This app is now configured as a Progressive Web App (PWA). Here's what has been set up and what you need to do:

## ✅ What's Already Configured

1. **Web App Manifest** (`public/manifest.json`)
   - App name, description, and display settings
   - Icon references (you need to generate the actual icons)
   - Theme colors and shortcuts

2. **Service Worker** (`public/sw.js`)
   - Offline caching strategy
   - Cache-first approach for static assets
   - Network-first for API routes
   - Background sync support

3. **Service Worker Registration** (`app/components/ServiceWorkerRegistration.tsx`)
   - Automatically registers the service worker
   - Handles updates and prompts users to reload

4. **PWA Meta Tags** (in `app/layout.tsx`)
   - Apple iOS support
   - Android support
   - Windows tile configuration

## 📱 Generate PWA Icons

You need to generate icon files in multiple sizes. You have two options:

### Option 1: Using the provided script (recommended)

1. Install sharp (if not already installed):
   ```bash
   npm install --save-dev sharp
   ```

2. Ensure `public/icon.png` exists (or update the script to point to your icon)

3. Run the script:
   ```bash
   node scripts/generate-icons.js
   ```

This will generate all required icon sizes in the `public/` directory.

### Option 2: Manual generation

Use an online tool like [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator) or [RealFaviconGenerator](https://realfavicongenerator.net/) to generate icons from your icon.

Required icon sizes:
- 72x72px
- 96x96px
- 128x128px
- 144x144px
- 152x152px
- 192x192px (required)
- 384x384px
- 512x512px (required)

## 🧪 Testing Your PWA

### Chrome DevTools

1. Open Chrome DevTools (F12)
2. Go to the "Application" tab
3. Check "Manifest" section - should show your app details
4. Check "Service Workers" section - should show registered worker
5. Use "Lighthouse" tab to run a PWA audit

### Mobile Testing

1. **Android (Chrome)**:
   - Visit your site
   - Chrome will show an "Add to Home Screen" prompt
   - Or use the menu → "Add to Home Screen"

2. **iOS (Safari)**:
   - Visit your site
   - Tap the Share button
   - Select "Add to Home Screen"

### Offline Testing

1. Open DevTools → Application → Service Workers
2. Check "Offline" checkbox
3. Refresh the page - it should still work (cached pages)

## 🎨 Customization

### Update Theme Color

Edit `app/layout.tsx`:
```typescript
export const viewport: Viewport = {
  themeColor: '#06b6d4', // Change to your brand color
};
```

And `public/manifest.json`:
```json
{
  "theme_color": "#06b6d4"
}
```

### Update App Name/Description

Edit `public/manifest.json`:
```json
{
  "name": "Your App Name",
  "short_name": "Short Name",
  "description": "Your app description"
}
```

### Customize Service Worker Caching

Edit `public/sw.js` to adjust caching strategies for your needs.

## 📋 PWA Checklist

- [x] Web App Manifest created
- [x] Service Worker implemented
- [x] Service Worker registered
- [x] PWA meta tags added
- [ ] Icons generated (run `node scripts/generate-icons.js`)
- [ ] Tested on Android device
- [ ] Tested on iOS device
- [ ] Tested offline functionality
- [ ] Lighthouse PWA audit passes

## 🚀 Deployment Notes

- Ensure HTTPS is enabled (required for service workers)
- Service workers only work on HTTPS (or localhost for development)
- Icons must be accessible at the paths specified in `manifest.json`

## 🔧 Troubleshooting

### Service Worker not registering
- Check browser console for errors
- Ensure you're on HTTPS (or localhost)
- Clear browser cache and try again

### Icons not showing
- Verify icon files exist in `public/` directory
- Check icon paths in `manifest.json` match actual files
- Ensure icons are PNG format

### App not installable
- Run Lighthouse audit to see what's missing
- Check manifest.json is valid JSON
- Ensure service worker is registered successfully
