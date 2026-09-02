const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

function response(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function parseDuration(iso) {
  const m = String(iso || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'POST only' });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return response(500, { error: 'YOUTUBE_API_KEY is not configured on Netlify' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'Invalid JSON' });
  }

  const query = String(body.query || '').trim();
  const maxResults = Math.max(1, Math.min(50, Number(body.maxResults) || 25));
  if (!query) return response(400, { error: 'กรุณาระบุคำค้นหา' });

  try {
    const searchParams = new URLSearchParams({
      key: apiKey,
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: String(maxResults),
    });
    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
    const searchData = await searchRes.json();
    if (!searchRes.ok) {
      const reason = searchData?.error?.errors?.[0]?.reason;
      const message = searchData?.error?.message || 'YouTube API error';
      throw new Error(reason ? `${message} (${reason})` : message);
    }

    const videos = Array.isArray(searchData.items) ? searchData.items : [];
    const ids = videos.map((item) => item?.id?.videoId).filter(Boolean);
    let detailsById = new Map();

    if (ids.length) {
      const detailParams = new URLSearchParams({
        key: apiKey,
        part: 'contentDetails,snippet',
        id: ids.join(','),
      });
      const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
      const detailData = await detailRes.json();
      if (detailRes.ok) {
        for (const item of detailData.items || []) detailsById.set(item.id, item);
      }
    }

    const items = videos.map((item) => {
      const id = item?.id?.videoId;
      const detail = detailsById.get(id);
      const duration = parseDuration(detail?.contentDetails?.duration);
      const thumbs = item?.snippet?.thumbnails || detail?.snippet?.thumbnails || {};
      return {
        id,
        title: item?.snippet?.title || 'Unknown',
        uploader: item?.snippet?.channelTitle || 'YouTube',
        duration,
        thumbnail:
          thumbs.medium?.url ||
          thumbs.high?.url ||
          `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        snippet: item?.snippet || {},
        contentDetails: { durationSeconds: duration },
      };
    }).filter((item) => item.id);

    return response(200, { items });
  } catch (error) {
    return response(502, { error: error?.message || 'YouTube request failed' });
  }
};
