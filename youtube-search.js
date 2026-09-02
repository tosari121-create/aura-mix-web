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
    const needle=normalize(artist), blocked=['รวมเพลง','รวมฮิต','longplay','medley','mix','playlist','compilation','nonstop','concert','karaoke','คาราโอเกะ','เบื้องหลัง','สัมภาษณ์','interview','teaser','trailer','ข่าว','shorts','reaction','รีแอค'];
    const rows=await multi([`"${artist}"`,`"${artist}" เพลง`,`"${artist}" official`,`"${artist}" music`,`"${artist}" MV`],320);
    return rows.filter(t=>{const title=normalize(t.title),up=normalize(t.uploader);if(!title.includes(needle)&&!up.includes(needle))return false;if(blocked.some(k=>title.includes(k)))return false;return !t.duration||(t.duration>=45&&t.duration<=1800);}).slice(0,90);
  }
  async function oldPlaylist(){
    const rows=await multi(['GMM GRAMMY OFFICIAL เพลงเก่า 1990','GMM GRAMMY OFFICIAL เพลงเก่า 1992','GMM GRAMMY OFFICIAL เพลงเก่า 1995','GMM GRAMMY OFFICIAL เพลงเก่า 1998','GMM GRAMMY OFFICIAL เพลงเก่า 2000','GMM GRAMMY OFFICIAL เพลงยุค 90 เพลงเดี่ยว','GMM GRAMMY OFFICIAL เพลงฮิตเก่า 90s'],360);
    const blocked=['รวมเพลง','รวมฮิต','longplay','medley','mix','playlist','compilation','nonstop','live','concert','karaoke','คาราโอเกะ','cover','cover version','เบื้องหลัง','สัมภาษณ์','interview','teaser','trailer','ตัวอย่าง','ข่าว','shorts'];
    const filtered=rows.filter(t=>normalize(t.uploader)==='gmm grammy official'&&!blocked.some(k=>normalize(t.title).includes(k))&&t.duration>=75&&t.duration<=900);
    for(let i=filtered.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[filtered[i],filtered[j]]=[filtered[j],filtered[i]];}
    return filtered.slice(0,90);
  }
  window.AuraYouTubeSearch={search,artistPlaylist,oldPlaylist};
})();
