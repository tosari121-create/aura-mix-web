const headers = {
  'Content-Type':'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Cache-Control':'no-store'
};
const json=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
function parseDuration(v){const m=String(v||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);return m?Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0):0;}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers,body:''};
  if(event.httpMethod!=='POST')return json(405,{error:'POST only'});
  const key=process.env.YOUTUBE_API_KEY;
  if(!key)return json(500,{error:'YOUTUBE_API_KEY is not configured on Netlify'});
  let body={};try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid JSON'})}
  const query=String(body.query||'').trim();const maxResults=Math.max(1,Math.min(50,Number(body.maxResults)||25));
  if(!query)return json(400,{error:'กรุณาระบุคำค้นหา'});
  try{
    const sp=new URLSearchParams({key,part:'snippet',q:query,type:'video',maxResults:String(maxResults)});
    const sr=await fetch(`https://www.googleapis.com/youtube/v3/search?${sp}`);const sd=await sr.json();
    if(!sr.ok){const reason=sd?.error?.errors?.[0]?.reason;return json(sr.status,{error:reason?`${sd?.error?.message||'YouTube API error'} (${reason})`:sd?.error?.message||'YouTube API error'});}
    const videos=(sd.items||[]).filter(x=>x?.id?.videoId);const ids=videos.map(x=>x.id.videoId);let details=new Map();
    if(ids.length){const dp=new URLSearchParams({key,part:'contentDetails,snippet',id:ids.join(',')});const dr=await fetch(`https://www.googleapis.com/youtube/v3/videos?${dp}`);const dd=await dr.json();if(dr.ok)for(const x of dd.items||[])details.set(x.id,x);}
    const items=videos.map(x=>{const id=x.id.videoId,d=details.get(id),s=d?.snippet||x.snippet||{},thumbs=s.thumbnails||x.snippet?.thumbnails||{};return{id,title:s.title||'Unknown',uploader:s.channelTitle||'YouTube',duration:parseDuration(d?.contentDetails?.duration),thumbnail:thumbs.medium?.url||thumbs.high?.url||`https://i.ytimg.com/vi/${id}/hqdefault.jpg`};});
    return json(200,{items});
  }catch(err){return json(502,{error:err?.message||'YouTube request failed'});}
};
