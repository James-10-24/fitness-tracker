# Nutri.AI PWA

Nutri.AI is a mobile-first progressive web app for logging meals, calories, and protein. This version includes a Node backend that calls the OpenAI API to estimate nutrition for free-text food descriptions.

## Files

- `index.html`: app shell and UI markup
- `styles.css`: visual design and responsive layout
- `app.js`: app state, rendering, storage, and client API calls
- `server.js`: static file server and `/api/estimate-food` backend endpoint
- `manifest.webmanifest`: install metadata for Android and desktop
- `sw.js`: offline asset caching

## Setup

1. Create a `.env` file in the project root.
2. Add your OpenAI API key:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
PORT=8080
```

`OPENAI_MODEL` and `PORT` are optional.

## Run locally

Start the backend:

```bash
node server.js
```

Then open:

```text
http://localhost:8080
```

## Install on Android

1. Open the running site in Chrome on Android.
2. Tap the browser menu.
3. Choose `Add to Home screen` or `Install app`.

## Notes

- App data is stored in `localStorage` on the current device.
- This version works offline after the first successful load of the frontend shell.
- AI nutrition estimates are approximate and should be editable before saving or logging.
- For production use, review rate limits, logging, and abuse protection on the backend.
