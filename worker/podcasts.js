/* Podcasts: shows with episodes. Episodes are links (https) to audio the administrator is entitled to distribute; no audio is stored here.
   Readers browse and listen; only administrators create, edit, hide and delete. */
const LANGS=['ru','uz'];
const MAX_EPISODES=500;

export function registerPodcasts({route,get,all,run,batch,stmt,json,bad,audit,clip,httpsUrl,id8}){
  const show=(r,n)=>({id:r.id,title:r.title,host:r.host||'',lang:r.lang,desc:r.descr||'',cover:r.cover||'',hidden:!!r.hidden,episodes:n??r.n??0,updated:r.updated});
  const counts=`(SELECT COUNT(*) FROM podcast_episodes e WHERE e.podcast_id=p.id)`;

  route('GET','/api/podcasts',async c=>{
    const rows=await all(c,`SELECT p.*,${counts} n FROM podcasts p WHERE p.hidden=0 ORDER BY p.updated DESC`);
    return json({podcasts:rows.filter(r=>r.n>0).map(r=>show(r))});
  });
  route('GET','/api/podcasts/:id',async(c,id)=>{
    const r=await get(c,`SELECT p.*,${counts} n FROM podcasts p WHERE p.id=?`,id);
    if(!r||(r.hidden&&!c.user.admin))return bad(404);
    const eps=await all(c,'SELECT id,idx,title,url,duration FROM podcast_episodes WHERE podcast_id=? ORDER BY idx,id',id);
    return json({podcast:show(r),episodes:eps});
  });

  route('GET','/api/admin/podcasts',async c=>json({podcasts:(await all(c,`SELECT p.*,${counts} n FROM podcasts p ORDER BY p.updated DESC`)).map(r=>show(r))}),true);
  /* create (no id) or update (id): only the fields that are sent change */
  route('POST','/api/admin/podcasts',async c=>{
    const b=c.body||{},old=b.id?await get(c,'SELECT * FROM podcasts WHERE id=?',String(b.id)):null;
    if(b.id&&!old)return bad(404);
    const has=k=>b[k]!==undefined,title=has('title')?clip(b.title,120):old?.title||'',lang=has('lang')?b.lang:old?.lang||'';
    if(!title)return bad(422,'title');if(!LANGS.includes(lang))return bad(422,'lang');
    const cover=has('cover')?(String(b.cover||'').trim()?httpsUrl(b.cover):''):old?.cover||'';
    if(has('cover')&&String(b.cover||'').trim()&&!cover)return bad(422,'cover');
    const host=has('host')?clip(b.host,120):old?.host||'',descr=has('desc')?clip(b.desc,2000):old?.descr||'',hidden=has('hidden')?(b.hidden?1:0):old?.hidden||0,now=Date.now();
    const id=old?old.id:'p'+id8();
    if(old)await run(c,'UPDATE podcasts SET title=?,host=?,lang=?,descr=?,cover=?,hidden=?,updated=? WHERE id=?',title,host,lang,descr,cover,hidden,now,id);
    else await run(c,'INSERT INTO podcasts(id,title,host,lang,descr,cover,hidden,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',id,title,host,lang,descr,cover,hidden,now,now);
    await audit(c,old?'podcast_update':'podcast_create',id,{title});
    return json({podcast:show({id,title,host,lang,descr,cover,hidden,updated:now},old?undefined:0)});
  },true);
  /* the whole list of episodes is replaced at once, like book audio */
  route('POST','/api/admin/podcasts/:id/episodes',async(c,id)=>{
    if(!await get(c,'SELECT id FROM podcasts WHERE id=?',id))return bad(404);
    const list=(Array.isArray(c.body?.episodes)?c.body.episodes:[]).slice(0,MAX_EPISODES).map((e,i)=>({title:clip(e?.title,160)||`Выпуск ${i+1}`,url:httpsUrl(e?.url),duration:Math.max(0,Math.min(86400,Math.round(+e?.duration)||0))}));
    if(list.some(e=>!e.url))return bad(422,'url');
    const now=Date.now();
    await batch(c,[stmt(c,'DELETE FROM podcast_episodes WHERE podcast_id=?',id),...list.map((e,i)=>stmt(c,'INSERT INTO podcast_episodes(podcast_id,idx,title,url,duration,created) VALUES(?,?,?,?,?,?)',id,i,e.title,e.url,e.duration,now)),stmt(c,'UPDATE podcasts SET updated=? WHERE id=?',now,id)]);
    await audit(c,'podcast_episodes',id,{episodes:list.length});return json({ok:true,episodes:list.length});
  },true);
  route('POST','/api/admin/podcasts/:id/delete',async(c,id)=>{
    await batch(c,[stmt(c,'DELETE FROM podcast_episodes WHERE podcast_id=?',id),stmt(c,'DELETE FROM podcasts WHERE id=?',id)]);
    await audit(c,'podcast_delete',id,{});return json({ok:true});
  },true);
}
