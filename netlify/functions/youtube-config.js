// AURA MIX — Safe API configuration check
// Does NOT return the API key. It only reports whether Netlify can see it.
exports.handler = async () => ({
  statusCode: 200,
  headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
  body: JSON.stringify({
    configured: Boolean(process.env.YOUTUBE_API_KEY),
    variable: 'YOUTUBE_API_KEY'
  })
});
