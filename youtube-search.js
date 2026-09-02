(() => {
  'use strict';
  const ENDPOINT = '/api/youtube-search';
  const SUFFIX = {'YouTube ทั้งหมด':'','Official / Audio':' official audio OR official','Official MV':' official MV','Live':' live','Karaoke':' karaoke'};
  const normalize = v => String(v||'').trim().toLowerCase().replace(/\s+/g,' ');

  function mapItem(x){
    const id = x?.id && typeof x.id==='object' ? x.id.videoId : x?.id;
    return {id,title:x?.title||'Unknown',uploader:x?.uploader||'YouTube',duration:Number(x?.duration)||0,thumbnail:x?.thumbnail||(id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:'')};
  }
  async function call(query,maxResults=25){
    const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'search',query,maxResults})});
    let data={}; try{data=await r.json();}catch{}
    if(!r.ok || data.error) throw new Error(data.error||`API error ${r.status}`);
    return (Array.isArray(data.items)?data.items:[]).map(mapItem).filter(x=>x.id);
  }
  async function multi(queries,limit){
    const out=[],seen=new Set();
    for(const q of queries){
      const rows=await call(q,50);
      for(const row of rows){if(seen.has(row.id))continue;seen.add(row.id);out.push(row);if(out.length>=limit)return out;}
    }
    return out;
  }
  async function search(q,mode='YouTube ทั้งหมด'){ return call(`${q}${SUFFIX[mode]||''}`.trim(),25); }
  async function artistPlaylist(artist){
    const name=String(artist||'').trim();
    if(!name) return [];
    const blocked=['รวมเพลง','รวมฮิต','longplay','medley','mix','playlist','compilation','nonstop','concert','karaoke','คาราโอเกะ','เบื้องหลัง','สัมภาษณ์','interview','teaser','trailer','ข่าว','shorts','reaction','รีแอค','reaction video'];

    // ค้นหลายรูปแบบเพื่อรองรับทั้งศิลปินไทย/อังกฤษ และชื่อที่อยู่เฉพาะในชื่อเพลง
    // ไม่บังคับว่าชื่อศิลปินต้องปรากฏใน title/uploader เพราะ YouTube บางคลิปตั้งชื่อด้วยชื่อเพลงอย่างเดียว
    const queries=[
      `"${name}"`,
      `"${name}" เพลง`,
      `"${name}" official`,
      `"${name}" music`,
      `"${name}" MV`,
      `${name} เพลง`
    ];
    const rows=await multi(queries,240);
    return rows
      .filter(t=>{
        const title=normalize(t.title);
        if(blocked.some(k=>title.includes(k))) return false;
        return !t.duration || (t.duration>=45 && t.duration<=1800);
      })
      .slice(0,90);
  }
  async function oldPlaylist(){
    // GMM GRAMMY OFFICIAL — classic 90s single tracks only.
    // The Netlify function pins the search to the verified GMM channel so
    // results cannot drift to fan uploads or other channels.
    const blocked=['รวมเพลง','รวมฮิต','longplay','medley','mix','playlist','compilation','nonstop','live','concert','karaoke','คาราโอเกะ','cover','cover version','เบื้องหลัง','สัมภาษณ์','interview','teaser','trailer','ตัวอย่าง','ข่าว','shorts','reaction','รีแอค','car-oke','caroke'];
    const queries=[
      'เพลงยุค 90 เพลงเดี่ยว','เพลงเก่า 1990','เพลงเก่า 1991','เพลงเก่า 1992',
      'เพลงเก่า 1993','เพลงเก่า 1994','เพลงเก่า 1995','เพลงเก่า 1996',
      'เพลงเก่า 1997','เพลงเก่า 1998','เพลงเก่า 1999','เพลงเก่า 2000',
      'GMM Grammy 90s official MV','GMM Grammy เพลงฮิตยุค 90'
    ];
    const out=[],seen=new Set();
    for(const q of queries){
      try{
        const r=await callOld90s(q,50);
        for(const t of r){
          const title=normalize(t.title), up=normalize(t.uploader);
          if(up!=='gmm grammy official') continue;
          if(blocked.some(k=>title.includes(k))) continue;
          if(t.duration && (t.duration<120 || t.duration>600)) continue;
          if(seen.has(t.id)) continue;
          seen.add(t.id); out.push(t);
          if(out.length>=30) break;
        }
      }catch(_){ /* keep trying the remaining era queries */ }
      if(out.length>=30) break;
    }
    // final safety: randomize the selected 30 so repeated taps are different.
    for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
    return out.slice(0,30);
  }
  async function callOld90s(query,maxResults=50){
    const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'old90s',query,maxResults})});
    let data={}; try{data=await r.json();}catch{}
    if(!r.ok || data.error) throw new Error(data.error||`API error ${r.status}`);
    return (Array.isArray(data.items)?data.items:[]).map(mapItem).filter(x=>x.id);
  }
  window.AuraYouTubeSearch={search,artistPlaylist,oldPlaylist};
})();
