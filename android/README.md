# Smart Realty — Android app (WebView)

This is a thin **Android native shell** that loads the Material-style app in `../m/` so it feels like a real phone app (not a browser tab with a pasted link).

## Option A — Try in browser (fastest)

```bash
cd ~/Projects/smart-realty-usa
python3 -m http.server 8766
# open phone-shaped app:
open http://127.0.0.1:8766/m/
```

On your phone (same Wi‑Fi): `http://YOUR_MAC_IP:8766/m/`  
Or install as PWA: Chrome → menu → **Install app** / **Add to Home screen**.

## Option B — Open in Android Studio → run on emulator/device

1. Open **Android Studio**
2. **File → Open** → `~/Projects/smart-realty-usa/android`
3. Let Gradle sync
4. Run on emulator or USB device

The WebView loads bundled assets from `app/src/main/assets/www/` (copy of `m/` + images + data).

### Refresh web assets into the Android project

```bash
cd ~/Projects/smart-realty-usa
./scripts/sync-android-assets.sh
```

## Option C — Play Store later

Use this WebView shell or upgrade to **Capacitor** / full Kotlin UI when you have a Play Console account. Demo password & auth API still apply for account features.
