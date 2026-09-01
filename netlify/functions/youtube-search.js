const API_KEY = process.env.YOUTUBE_API_KEY;

exports.handler = async (event) => {
  const { q, mode, max = 10, exclude = '' } = event.queryStringParameters || {};

  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY ใน Netlify Environment Variables' })
    };
  }

  if (!q) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'กรุณาระบุคำค้นหา' })
    };
  }

  try {
    let searchQuery = q;
    if (mode === 'official') searchQuery += ' official audio';
    else if (mode === 'mv') searchQuery += ' official mv';
    else if (mode === 'live') searchQuery += ' live';
    else if (mode === 'karaoke') searchQuery += ' karaoke';

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${max}&q=${encodeURIComponent(searchQuery)}&key=${API_KEY}`;
    
    const res = await fetch(searchUrl);
    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: data.error?.message || 'YouTube API Error' })
      };
    }

    const excludeIds = exclude.split(',').filter(Boolean);
    const videoIds = (data.items || [])
      .map(item => item.id?.videoId)
      .filter(id => id && !excludeIds.includes(id));

    if (videoIds.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([])
      };
    }

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds.join(',')}&key=${API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    const results = (detailsData.items || []).map(item => {
      const isoDuration = item.contentDetails?.duration || 'PT0S';
      const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      const hours = parseInt(match[1] || 0, 10);
      const minutes = parseInt(match[2] || 0, 10);
      const seconds = parseInt(match[3] || 0, 10);
      const durationSeconds = hours * 3600 + minutes * 60 + seconds;

      return {
        id: item.id,
        title: item.snippet.title,
        uploader: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        duration: durationSeconds
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
