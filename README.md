# Hale PWA

Hale is a mobile-first progressive web app for logging meals, movement, water, and macros. Live. Move. Thrive. The app works in guest mode with local storage, and optionally uses Supabase for simple email/password accounts and per-user data sync, plus a Node backend that calls the OpenAI API for nutrition estimates.

## Files

- `index.html`: app shell and UI markup
- `styles.css`: visual design and responsive layout
- `app.js`: app state, rendering, storage, and client API calls
- `server.js`: static file server and `/api/estimate-food` backend endpoint
- `supabase/schema.sql`: tables and row-level security policies for per-user data
- `manifest.webmanifest`: install metadata for Android and desktop
- `sw.js`: offline asset caching

## Setup

1. In Supabase, open the SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql).
2. In `Authentication -> Providers -> Email`, keep email/password enabled.
3. If you want instant sign-up without email confirmation during development, disable email confirmation in Supabase Auth settings.
4. For Vercel deployment, add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the Vercel project environment variables so `/api/estimate-food` works in production.
5. Create a `.env` file in the project root for local development.
5. Add your OpenAI API key:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
PORT=8080
```

`OPENAI_MODEL` and `PORT` are optional locally.

## Run locally

Start the backend:

```bash
node server.js
```

Then open:

```text
http://localhost:8080
```

## Auth and Data

- Users create an account with email + password.
- App data is stored in Supabase and scoped to the signed-in user through Row Level Security.
- The app keeps a local browser cache per user and will import older local-only data into Supabase the first time a newly signed-in account has no cloud data.

## Install on Android

1. Open the running site in Chrome on Android.
2. Tap the browser menu.
3. Choose `Add to Home screen` or `Install app`.

## Notes

- This version works offline after the first successful load of the frontend shell.
- AI nutrition estimates are approximate and should be editable before saving or logging.
- For production use, review rate limits, logging, and abuse protection on the backend.
- If you change `index.html`, `app.js`, or `styles.css`, bump the cache name in `sw.js` so the PWA updates cleanly.
