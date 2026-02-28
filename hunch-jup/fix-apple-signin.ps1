# Script to clean and rebuild for Apple Sign In fix

Write-Host "🧹 Cleaning iOS build..." -ForegroundColor Yellow
Remove-Item -Path "ios" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "🧹 Cleaning node_modules..." -ForegroundColor Yellow
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "📦 Reinstalling dependencies..." -ForegroundColor Cyan
npm install

Write-Host "🔨 Prebuilding iOS with Apple Sign In..." -ForegroundColor Cyan
npx expo prebuild --platform ios --clean

Write-Host "✅ Done! Now test Apple Sign In" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Verify Apple Developer Portal configuration (Services ID + Redirect URIs)"
Write-Host "2. Verify Privy Dashboard has Bundle ID as Client ID"
Write-Host "3. Wait 10 minutes for Apple's config to propagate"
Write-Host "4. Run: npx expo run:ios"
