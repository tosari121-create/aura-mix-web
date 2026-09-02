# AURA MIX — Mobile Netlify

## Netlify
1. Upload the whole folder/repository.
2. Build command: leave empty.
3. Publish directory: `.`
4. Functions directory: `netlify/functions`
5. Site configuration → Environment variables → add `YOUTUBE_API_KEY` with your YouTube Data API v3 key.
6. Deploy again after adding/changing the key.

The browser calls `/api/youtube-search`; the API key stays inside the Netlify Function.

## Required structure
```
netlify/
  functions/
    youtube-search.js
index.html
app.js
styles.css
youtube-search.js
netlify.toml
package.json
```
