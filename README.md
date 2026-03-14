# NutriLog PWA

NutriLog is a mobile-first progressive web app for logging meals, calories, and protein.

## Files

- `index.html`: app shell and UI markup
- `styles.css`: visual design and responsive layout
- `app.js`: app state, rendering, storage, and interaction logic
- `manifest.webmanifest`: install metadata for Android and desktop
- `sw.js`: offline asset caching

## Run locally

Because service workers do not work reliably from a plain `file://` URL, serve the folder over HTTP.

If you have Python installed:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Install on Android

1. Open the deployed site in Chrome on Android.
2. Tap the browser menu.
3. Choose `Add to Home screen` or `Install app`.

## Notes

- App data is stored in `localStorage` on the current device.
- This version works offline after the first successful load.
- The current app is local-only. If you want account sync or a calorie lookup API next, that should be added as a separate backend or API integration.
