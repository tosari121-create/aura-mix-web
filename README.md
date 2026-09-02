# AURA MIX — Mobile Netlify

## Netlify
1. Deploy the whole project.
2. Create Environment Variable: `YOUTUBE_API_KEY`.
3. Use the generated API key with YouTube Data API v3 enabled.
4. Redeploy after changing the variable.

## Structure
- `index.html`
- `styles.css`
- `app.js`
- `youtube-search.js`
- `manifest.webmanifest`
- `sw.js`
- `netlify.toml`
- `netlify/functions/youtube-search.js`

## Mobile playback
The player uses the YouTube IFrame API plus Media Session metadata and a service worker for a mobile-app-like experience. Actual screen-off/background behavior remains dependent on the browser/OS and YouTube playback policies; no web page can guarantee playback after the browser itself suspends or is force-closed.
