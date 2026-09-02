(function(){
  'use strict';
  const ENDPOINTS=['/api/youtube-search','/.netlify/functions/youtube-search'];
  const SUFFIX={'YouTube ทั้งหมด':'','Official / Audio':' official audio OR official','Official MV':' official MV','Live':' live','Karaoke':' karaoke'};
  const normalize=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
  function mapItem(x){
    const id=x?.id && typeof x.id==='object'?x.id.videoId:x?.id;
    const s=x?.snippet||{};
    return {id,title:s.title||x?.title||'Unknown',uploader:s.channelTitle||x?.uploader||'YouTube',duration:Number(x?.duration||x?.contentDetails?.durationSeconds||0),thumbnail:s.thumbnails?.medium?.url||s.thumbnails?.high?.url||x?.thumbnail||(id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:'')};
  }
  async function call(query,maxResults=25){
    let last='เชื่อมต่อ YouTube ไม่สำเร็จ';
    for(const url of ENDPOINTS){
      try{
        const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'search',query,maxResults})});
        const data=await r.json().catch(()=>({}));
        if(r.ok&&!data.error) return (Array.isArray(data.items)?data.items:[]).map(mapItem).filter(x=>x.id);
        last=data.error||`API error ${r.status}`;
      }catch(e){last=e?.message||last;}
    }
    throw new Error(last);
  }
  async function multi(queries,limit){
    const out=[],seen=new Set();
    for(const q of queries){
      const rows=await call(q,50);
      for(const row of rows){if(seen.has(row.id))continue;seen.add(row.id);out.push(row);if(out.length>=limit)return out;}
    }
    return out;
  }
  async function search(q,mode){return call(`${q} ${SUFFIX[mode]||''}`.trim(),25);}
  async function artistPlaylist(artist){
    const needle=normalize(artist);
    const rows=await multi([`"${artist}"`,`"${artist}" เพลง`,`"${artist}" official`,`"${artist}" music`,`"${artist}" MV`],320);
    const blocked=['รวมเพลง','รวมฮิต','longplay','medley','mix','playlist','compilation','nonstop','concert','karaoke','คาราโอเกะ','เบื้องหลัง','สัมภาษณ์','interview','teaser','trailer','ข่าว','shorts','reaction','รีแอค'];
    return rows.filter(t=>{const title=normalize(t.title),up=normalize(t.uploader);if(!title.includes(needle)&&!up.includes(needle))return false;if(blocked.some(k=>title.includes(k)))return false;return !t.duration||(t.duration>=45&&t.duration<=1800)}).slice(0,90);
  }
  async function oldPlaylist(){
    const queries=['GMM GRAMMY OFFICIAL เพลงเก่า 1990','GMM GRAMMY OFFICIAL เพลงเก่า 1992','GMM GRAMMY OFFICIAL เพลงเก่า 1995','GMM GRAMMY OFFICIAL เพลงเก่า 1998','GMM GRAMMY OFFICIAL เพลงเก่า 2000','GMM GRAMMY OFFICIAL เพลงยุค 90 เพลงเดี่ยว','GMM GRAMMY OFFICIAL เพลงฮิตเก่า 90s'];
    let rows=await multi(queries,360);
    const blocked=['รวมเพลง','รวมฮิต','longplay','medley','mix','playlist','compilation','nonstop','live','concert','karaoke','คาราโอเกะ','cover','cover version','เบื้องหลัง','สัมภาษณ์','interview','teaser','trailer','ตัวอย่าง','ข่าว','shorts'];
    rows=rows.filter(t=>{const up=normalize(t.uploader),title=normalize(t.title);if(up!=='gmm grammy official')return false;if(blocked.some(k=>title.includes(k)))return false;return t.duration>=75&&t.duration<=900});
    for(let i=rows.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]]}
    return rows.slice(0,90);
  }
  window.AuraYouTubeSearch={search,artistPlaylist,oldPlaylist};
})();
