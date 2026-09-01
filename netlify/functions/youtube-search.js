const ytSearch = require('yt-search');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    const rawQuery = params.q || '';
    const mode = params.mode || 'all';
    const max = parseInt(params.max, 10) || 25;
    const excludeIds = (params.exclude || '').split(',').filter(Boolean);

    if (!rawQuery.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query parameter "q" is required' })
      };
    }

    let searchQuery = rawQuery;
    if (mode === 'official') searchQuery += ' official audio';
    else if (mode === 'mv') searchQuery += ' official mv';
    else if (mode === 'live') searchQuery += ' live';
    else if (mode === 'karaoke') searchQuery += ' คาราโอเกะ';

    const r = await ytSearch(searchQuery);
    const videos = r.videos || [];

    const excludeSet = new Set(excludeIds);
    const filtered = videos
      .filter(v => v.videoId && !excludeSet.has(v.videoId))
      .slice(0, max)
      .map(v => ({
        id: v.videoId,
        title: v.title,
        uploader: v.author ? v.author.name : 'Unknown Artist',
        duration: v.seconds || 0,
        thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(filtered)
    };
  } catch (err) {
    console.error('Search error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' })
    };
  }
};
