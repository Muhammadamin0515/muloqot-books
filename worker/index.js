import {parseManuscript} from './parse.js';
import {ensureSchema} from './schema.js';

const J=JSON.stringify,P=s=>JSON.parse(s);
const clip=(s,n)=>String(s??'').trim().slice(0,n);
const id8=()=>crypto.randomUUID().slice(0,8);
const GENRES=['novel','detective','historical','adventure','drama','stories','modern'];
const LOCAL=['state','reviews','threads','subs','reacts','qLikes','follows','ratings'];
const csv=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);

/* ---------- Telegram ---------- */
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',k,data)}
/** Validates Telegram WebApp initData; returns the Telegram user or null. */
async function verifyInitData(initData,token){
  try{
    const p=new URLSearchParams(initData);const hash=p.get('hash');if(!hash)return null;p.delete('hash');
    const str=[...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n');
    const enc=new TextEncoder();
    const secret=await hmac(enc.encode('WebAppData'),enc.encode(token));
    if(hex(await hmac(secret,enc.encode(str)))!==hash)return null;
    if(Date.now()/1000-Number(p.get('auth_date')||0)>48*3600)return null;
    return JSON.parse(p.get('user')||'null');
  }catch{return null}
}
const tgApi=(env,method,body)=>env.BOT_TOKEN?fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:J(body)}).catch(()=>null):Promise.resolve(null);
const openBtn=env=>env.WEBAPP_URL?{reply_markup:{inline_keyboard:[[{text:'Открыть Muloqot Books',web_app:{url:env.WEBAPP_URL}}]]}}:{};
/** Bot message to a Telegram user (their id is the private chat id). No-op without BOT_TOKEN or for dev users. */
const notify=(c,userId,text)=>{if(!c.env.BOT_TOKEN||!/^\d+$/.test(String(userId||'')))return;c.ctx.waitUntil(tgApi(c.env,'sendMessage',{chat_id:userId,text,...openBtn(c.env)}))};

/* ---------- D1 helpers ---------- */
const stmt=(c,sql,...a)=>c.env.DB.prepare(sql).bind(...a.map(x=>x===undefined?null:x));
const all=async(c,sql,...a)=>(await stmt(c,sql,...a).all()).results;
const get=(c,sql,...a)=>stmt(c,sql,...a).first();
const run=(c,sql,...a)=>stmt(c,sql,...a).run();
const batch=async(c,list)=>(await c.env.DB.batch(list)).map(r=>r.results);

const adminIds=async c=>[...new Set([...csv(c.env.ADMIN_IDS),...(await all(c,'SELECT user_id FROM admins')).map(r=>r.user_id)])];
const notifyAdmins=async(c,text)=>{for(const a of await adminIds(c))notify(c,a,text)};
const rel=ms=>{const m=Math.max(0,Math.floor((Date.now()-ms)/6e4));
  if(m<2)return{ru:'только что',uz:'hozirgina'};if(m<60)return{ru:`${m} мин назад`,uz:`${m} daqiqa oldin`};
  const h=Math.floor(m/60);if(h<24)return{ru:`${h} ч назад`,uz:`${h} soat oldin`};
  const d=Math.floor(h/24);if(d<14)return{ru:`${d} дн. назад`,uz:`${d} kun oldin`};
  const w=Math.floor(d/7);return{ru:`${w} нед. назад`,uz:`${w} hafta oldin`}};

/* ---------- serializers (bulk, a handful of queries per request) ---------- */
function bookOut(row,agg){const b=P(row.data);const a=agg[row.id]||{n:0,s:0};const count=b.count+a.n;return{...b,count,rating:Math.round((b.rating*b.count+a.s)/count*100)/100}}
const ratingAgg=async c=>{const o={};(await all(c,'SELECT book_id,COUNT(*) n,SUM(value) s FROM ratings GROUP BY book_id')).forEach(r=>o[r.book_id]={n:r.n,s:r.s});return o};
const bookById=async(c,id)=>{const row=await get(c,'SELECT * FROM books WHERE id=?',id);if(!row)return null;const a=await get(c,'SELECT COUNT(*) n,COALESCE(SUM(value),0) s FROM ratings WHERE book_id=?',id);return bookOut(row,{[id]:a})};

async function loadReviews(c,onlyId){
  const w=onlyId?' WHERE id=?':'',args=onlyId?[onlyId]:[];
  const [rv,rp,rc,mine]=await batch(c,[
    stmt(c,`SELECT * FROM reviews${w} ORDER BY created DESC LIMIT 200`,...args),
    stmt(c,'SELECT review_id,user_name,text,is_author FROM review_replies ORDER BY id'),
    stmt(c,"SELECT target,kind,COUNT(*) n FROM reacts WHERE target LIKE 'r:%' GROUP BY target,kind"),
    stmt(c,"SELECT target,kind FROM reacts WHERE user_id=? AND target LIKE 'r:%'",c.user.id)]);
  const cnt={};rc.forEach(x=>cnt[x.target+x.kind]=x.n);
  return rv.map(r=>{const t='r:'+r.id;const my={};mine.filter(m=>m.target===t).forEach(m=>my[m.kind]=true);
    return{id:r.id,bookId:r.book_id,user:r.user_name,rating:r.rating,text:r.text,date:rel(r.created),mine:r.user_id===c.user.id,
      likes:r.likes_base+(cnt[t+'heart']||0),insight:r.insight_base+(cnt[t+'insight']||0),my,
      replies:rp.filter(x=>x.review_id===r.id).map(x=>({user:x.user_name,text:x.text,...(x.is_author?{author:1}:{})}))}});
}
async function loadThreads(c,onlyId){
  const w=onlyId?' WHERE id=?':'',args=onlyId?[onlyId]:[];
  const [th,cs]=await batch(c,[stmt(c,`SELECT * FROM threads${w} ORDER BY created DESC LIMIT 100`,...args),stmt(c,onlyId?'SELECT * FROM comments WHERE thread_id=? ORDER BY id':'SELECT * FROM comments ORDER BY id',...args)]);
  return th.map(t=>{const mine=cs.filter(x=>x.thread_id===t.id);
    return{id:t.id,bookId:t.book_id,title:t.title,user:t.user_name,text:t.text,
      comments:mine.filter(x=>!x.parent_id).map(x=>({id:x.id,user:x.user_name,text:x.text,replies:mine.filter(y=>y.parent_id===x.id).map(y=>({user:y.user_name,text:y.text}))}))}});
}
async function loadQuotes(c,onlyId){
  const [qs,rc,mine]=await batch(c,[
    stmt(c,`SELECT * FROM quotes${onlyId?' WHERE id=?':''}`,...(onlyId?[onlyId]:[])),
    stmt(c,"SELECT target,COUNT(*) n FROM reacts WHERE target LIKE 'q:%' AND kind='heart' GROUP BY target"),
    stmt(c,"SELECT target FROM reacts WHERE user_id=? AND target LIKE 'q:%' AND kind='heart'",c.user.id)]);
  return qs.map(q=>({id:q.id,bookId:q.book_id,text:q.text,likes:q.likes_base+(rc.find(x=>x.target==='q:'+q.id)?.n||0),mine:mine.some(x=>x.target==='q:'+q.id)}));
}
const subOut=s=>({id:s.id,title:s.title,status:s.status,note:s.note||'',bookId:s.book_id||null});

/* ---------- routes ---------- */
const routes=[];
const route=(method,path,fn,admin)=>routes.push({method,re:new RegExp('^'+path.replace(/:\w+/g,'([^/]+)')+'$'),fn,admin});
const json=(o,status=200)=>new Response(J(o),{status,headers:{'content-type':'application/json'}});
const bad=(s=400,e='invalid')=>json({error:e},s);

route('GET','/api/bootstrap',async c=>{
  const uid=c.user.id;
  const [books,authors,fol,meta,sub,usr,my1,my2]=await batch(c,[
    stmt(c,'SELECT * FROM books WHERE hidden=0 OR hidden IS NULL'),stmt(c,'SELECT * FROM authors'),stmt(c,'SELECT author_id,COUNT(*) n FROM follows GROUP BY author_id'),
    stmt(c,'SELECT key,value FROM meta'),stmt(c,'SELECT * FROM submissions WHERE user_id=? ORDER BY created DESC',uid),
    stmt(c,'SELECT state FROM users WHERE id=?',uid),stmt(c,'SELECT book_id,value FROM ratings WHERE user_id=?',uid),stmt(c,'SELECT author_id FROM follows WHERE user_id=?',uid)]);
  const agg=await ratingAgg(c),m=Object.fromEntries(meta.map(x=>[x.key,P(x.value)]));
  const sup=await get(c,'SELECT COUNT(*) n FROM support_messages WHERE user_id=? AND from_admin=1 AND read=0',uid);
  return json({me:{id:uid,name:c.user.name,admin:c.user.admin,superadmin:c.user.superadmin,supportUnread:sup.n},
    books:books.map(b=>bookOut(b,agg)),
    authors:authors.map(a=>({...P(a.data),followers:a.followers_base+(fol.find(f=>f.author_id===a.id)?.n||0)})),
    collections:m.collections,weekly:m.weekly,quotes:await loadQuotes(c),reviews:await loadReviews(c),threads:await loadThreads(c),
    ratings:Object.fromEntries(my1.map(r=>[r.book_id,r.value])),follows:my2.map(r=>r.author_id),subs:sub.map(subOut),state:P(usr[0]?.state||'{}')});
});
route('PUT','/api/state',async c=>{
  const s={...c.body};LOCAL.forEach(k=>delete s[k]);const txt=J(s);
  if(txt.length>300_000)return bad(413,'too large');
  await run(c,'UPDATE users SET state=? WHERE id=?',txt,c.user.id);return json({ok:true});
});
const upsertRating=(c,bookId,v)=>run(c,'INSERT INTO ratings VALUES(?,?,?) ON CONFLICT(user_id,book_id) DO UPDATE SET value=excluded.value',c.user.id,bookId,v);
route('POST','/api/books/:id/rate',async(c,id)=>{
  if(!await get(c,'SELECT 1 x FROM books WHERE id=?',id))return bad(404);
  const v=Math.round(+c.body.value);if(!(v>=1&&v<=5))return bad();
  await upsertRating(c,id,v);const b=await bookById(c,id);return json({rating:b.rating,count:b.count});
});
route('POST','/api/authors/:id/follow',async(c,id)=>{
  if(!await get(c,'SELECT 1 x FROM authors WHERE id=?',id))return bad(404);
  if(c.body.on)await run(c,'INSERT OR IGNORE INTO follows VALUES(?,?)',c.user.id,id);else await run(c,'DELETE FROM follows WHERE user_id=? AND author_id=?',c.user.id,id);
  const a=await get(c,'SELECT (SELECT followers_base FROM authors WHERE id=?)+COUNT(*) n FROM follows WHERE author_id=?',id,id);return json({followers:a.n});
});
route('POST','/api/reviews',async c=>{
  const {bookId,rating}=c.body,text=clip(c.body.text,2000);
  if(!await get(c,'SELECT 1 x FROM books WHERE id=?',bookId)||!(rating>=1&&rating<=5)||text.length<10)return bad();
  const id='u'+id8();
  await run(c,'INSERT INTO reviews(id,book_id,user_id,user_name,rating,text,created) VALUES(?,?,?,?,?,?,?)',id,bookId,c.user.id,c.user.name,Math.round(rating),text,Date.now());
  await upsertRating(c,bookId,Math.round(rating));const b=await bookById(c,bookId);
  return json({review:(await loadReviews(c,id))[0],rating:b.rating,count:b.count});
});
route('POST','/api/reviews/:id/react',async(c,id)=>{
  if(!await get(c,'SELECT 1 x FROM reviews WHERE id=?',id))return bad(404);
  const k=c.body.kind==='insight'?'insight':'heart',t='r:'+id;
  if(c.body.on)await run(c,'INSERT OR IGNORE INTO reacts VALUES(?,?,?)',c.user.id,t,k);else await run(c,'DELETE FROM reacts WHERE user_id=? AND target=? AND kind=?',c.user.id,t,k);
  const r=(await loadReviews(c,id))[0];return json({likes:r.likes,insight:r.insight});
});
route('POST','/api/reviews/:id/replies',async(c,id)=>{
  const r=await get(c,'SELECT * FROM reviews WHERE id=?',id),text=clip(c.body.text,1000);if(!r||!text)return bad();
  const owner=await get(c,"SELECT a.user_id FROM books b JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE b.id=?",r.book_id);
  await run(c,'INSERT INTO review_replies(review_id,user_id,user_name,text,is_author,created) VALUES(?,?,?,?,?,?)',id,c.user.id,c.user.name,text,owner?.user_id===c.user.id?1:0,Date.now());
  if(r.user_id&&r.user_id!==c.user.id){const u=await get(c,'SELECT state FROM users WHERE id=?',r.user_id);const n=P(u?.state||'{}').notif;if(!n||n.replies!==false)notify(c,r.user_id,`${c.user.name} ответил(а) на ваш отзыв: «${text.slice(0,120)}»`)}
  return json({review:(await loadReviews(c,id))[0]});
});
route('POST','/api/threads',async c=>{
  const title=clip(c.body.title,200);if(!title)return bad();
  const bookId=c.body.bookId&&await get(c,'SELECT 1 x FROM books WHERE id=?',c.body.bookId)?c.body.bookId:null;
  const id='t'+id8();await run(c,'INSERT INTO threads VALUES(?,?,?,?,?,?,?)',id,bookId,c.user.id,c.user.name,title,'',Date.now());
  return json({thread:(await loadThreads(c,id))[0]});
});
route('POST','/api/threads/:id/comments',async(c,id)=>{
  const t=await get(c,'SELECT * FROM threads WHERE id=?',id),text=clip(c.body.text,1000);if(!t||!text)return bad();
  let parent=null;
  if(c.body.parentId){const p=await get(c,'SELECT * FROM comments WHERE id=? AND thread_id=? AND parent_id IS NULL',c.body.parentId,id);if(!p)return bad();parent=p.id;
    if(p.user_id&&p.user_id!==c.user.id)notify(c,p.user_id,`${c.user.name} ответил(а) на ваш комментарий в «${t.title}»`)}
  await run(c,'INSERT INTO comments(thread_id,parent_id,user_id,user_name,text,created) VALUES(?,?,?,?,?,?)',id,parent,c.user.id,c.user.name,text,Date.now());
  return json({thread:(await loadThreads(c,id))[0]});
});
route('POST','/api/quotes/:id/like',async(c,id)=>{
  if(!await get(c,'SELECT 1 x FROM quotes WHERE id=?',id))return bad(404);
  if(c.body.on)await run(c,'INSERT OR IGNORE INTO reacts VALUES(?,?,?)',c.user.id,'q:'+id,'heart');else await run(c,'DELETE FROM reacts WHERE user_id=? AND target=? AND kind=?',c.user.id,'q:'+id,'heart');
  return json({likes:(await loadQuotes(c,id))[0].likes});
});
route('POST','/api/quotes',async c=>{
  const text=clip(c.body.text,500);if(!text||!await get(c,'SELECT 1 x FROM books WHERE id=?',c.body.bookId))return bad();
  const id='q'+id8();await run(c,'INSERT INTO quotes(id,book_id,text,likes_base) VALUES(?,?,?,0)',id,c.body.bookId,text);
  return json({quote:(await loadQuotes(c,id))[0]});
});

route('POST','/api/submissions',async c=>{
  const b=c.body,title=clip(b.title,120),desc=clip(b.desc,3000),body=String(b.body||'').slice(0,1_200_000);
  if(title.length<2||desc.length<20)return bad();
  if(body.trim().length<500)return bad(400,'manuscript');
  const cover=typeof b.cover==='string'&&b.cover.startsWith('data:image/')&&b.cover.length<900_000?b.cover:null;
  const id='s'+id8();
  await run(c,'INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,c.user.id,title,clip(b.author,60)||c.user.name,b.lang==='uz'?'uz':'ru',GENRES.includes(b.genre)?b.genre:'novel',desc,clip(b.tags,200),cover,clip(b.fileName,120),body,'moderation','',null,Date.now());
  await notifyAdmins(c,`Новая заявка на модерацию: «${title}»`);
  return json({sub:subOut(await get(c,'SELECT * FROM submissions WHERE id=?',id))});
});
route('GET','/api/admin/submissions',async c=>json((await all(c,"SELECT id,title,status,note,book_id,author_name,lang,genre,description,LENGTH(body) chars,SUBSTR(body,1,900) preview,user_id FROM submissions WHERE status='moderation' ORDER BY created")).map(s=>({...subOut(s),author:s.author_name,lang:s.lang,genre:s.genre,desc:s.description,chars:s.chars,preview:s.preview,userId:s.user_id}))),true);
route('POST','/api/admin/submissions/:id/reject',async(c,id)=>{
  const s=await get(c,"SELECT * FROM submissions WHERE id=? AND status='moderation'",id);if(!s)return bad(404);
  const note=clip(c.body.note,300);await run(c,"UPDATE submissions SET status='rejected',note=? WHERE id=?",note,id);
  notify(c,s.user_id,`Заявка «${s.title}» отклонена.${note?' '+note:''}`);return json({ok:true});
},true);
route('POST','/api/admin/submissions/:id/approve',async(c,id)=>{
  const s=await get(c,"SELECT * FROM submissions WHERE id=? AND status='moderation'",id);if(!s)return bad(404);
  const chapters=parseManuscript(s.body);if(!chapters.length)return bad(400,'empty');
  let a=await get(c,"SELECT * FROM authors WHERE user_id=? OR lower(json_extract(data,'$.name'))=lower(?)",s.user_id,s.author_name);
  if(!a){const aid='a'+id8();const pal=[['#2a1a14','#7a2e17'],['#10282c','#2f6672'],['#26141a','#7a3346'],['#2a1f12','#8a5a22']][aid.charCodeAt(1)%4];
    await run(c,'INSERT INTO authors VALUES(?,?,?,?)',aid,J({id:aid,name:s.author_name,city:{ru:'',uz:''},hair:'short',hairc:'#2a1c12',skin:'#d3ab88',glasses:0,pal,bio:{ru:'',uz:''}}),0,s.user_id);
    a={id:aid}}
  const bid='b'+id8(),chars=chapters.reduce((n,x)=>n+x.p.join('').length,0);
  const motifs=['window','tree','train','caravan','books','tea','river','door','mount','bird','clock','ornament'];
  const pals=[['#2a1a14','#7a2e17','#e8742f','#140c09','#f0dfc6'],['#101418','#1d2a2e','#d8552a','#0a0d0f','#e9dcc3'],['#17201d','#2d4a42','#e07a2f','#0e1411','#efe1c2'],['#1c1416','#5a2230','#f08f45','#100a0c','#f1ddc3']];
  const h=[...s.id].reduce((x,ch)=>x+ch.charCodeAt(0),0);
  const added=((await get(c,'SELECT COALESCE(MAX(added),0) m FROM books')).m)+1;
  const book={id:bid,a:a.id,title:s.title,lang:s.lang,genre:s.genre,rating:4,count:0,pages:Math.max(1,Math.round(chars/1800)),year:new Date().getFullYear(),added,motif:motifs[h%motifs.length],pal:pals[h%pals.length],desc:s.description,chapters,...(s.cover?{img:s.cover}:{})};
  await batch(c,[stmt(c,'INSERT INTO books VALUES(?,?,?)',bid,J(book),added),stmt(c,"UPDATE submissions SET status='approved',book_id=? WHERE id=?",bid,id)]);
  notify(c,s.user_id,`Книга «${s.title}» опубликована в каталоге!`);
  for(const f of await all(c,'SELECT f.user_id,u.state FROM follows f JOIN users u ON u.id=f.user_id WHERE f.author_id=?',a.id))
    if(P(f.state||'{}').notif?.authors!==false)notify(c,f.user_id,`Новая книга автора ${s.author_name}: «${s.title}»`);
  return json({bookId:bid});
},true);

/* ---------- support chat (user side) ---------- */
route('GET','/api/support',async c=>{
  const msgs=await all(c,'SELECT id,from_admin,text,created FROM support_messages WHERE user_id=? ORDER BY id DESC LIMIT 100',c.user.id);
  await run(c,'UPDATE support_messages SET read=1 WHERE user_id=? AND from_admin=1 AND read=0',c.user.id);
  return json({messages:msgs.reverse().map(m=>({id:m.id,mine:!m.from_admin,text:m.text,at:m.created}))});
});
route('POST','/api/support',async c=>{
  const text=clip(c.body.text,2000);if(!text)return bad();
  if((await get(c,'SELECT COUNT(*) n FROM support_messages WHERE user_id=? AND from_admin=0 AND created>?',c.user.id,Date.now()-6e4)).n>=10)return bad(429,'slow down');
  await run(c,'INSERT INTO support_messages(user_id,from_admin,text,created,read) VALUES(?,?,?,?,0)',c.user.id,0,text,Date.now());
  await notifyAdmins(c,`💬 Сообщение в поддержку от ${c.user.name}: «${text.slice(0,200)}»`);
  return json({ok:true});
});

/* ---------- admin: overview ---------- */
route('GET','/api/admin/stats',async c=>{
  const now=Date.now(),D=864e5,n=(sql,...a)=>stmt(c,sql,...a);
  const r=await batch(c,[
    n('SELECT COUNT(*) n FROM users'),n('SELECT COUNT(*) n FROM users WHERE created>?',now-D),n('SELECT COUNT(*) n FROM users WHERE created>?',now-7*D),
    n('SELECT COUNT(*) n FROM users WHERE last_seen>?',now-D),n('SELECT COUNT(*) n FROM users WHERE last_seen>?',now-7*D),
    n('SELECT COUNT(*) n FROM users WHERE banned=1'),n('SELECT COUNT(*) n FROM users WHERE blocked=1'),
    n('SELECT COUNT(*) n FROM books WHERE hidden=0 OR hidden IS NULL'),n('SELECT COUNT(*) n FROM books WHERE hidden=1'),
    n('SELECT COUNT(*) n FROM reviews'),n('SELECT COUNT(*) n FROM threads'),n('SELECT COUNT(*) n FROM comments'),
    n("SELECT COUNT(*) n FROM submissions WHERE status='moderation'"),
    n('SELECT COUNT(DISTINCT user_id) n FROM support_messages WHERE from_admin=0 AND read=0'),
    n("SELECT date(created/1000,'unixepoch') d,COUNT(*) n FROM users WHERE created>? GROUP BY d ORDER BY d",now-14*D),
    n("SELECT COUNT(*) n FROM users WHERE blocked=0 AND banned=0 AND id GLOB '[0-9]*'")]);
  const v=i=>r[i][0].n;
  return json({users:v(0),new24:v(1),new7:v(2),active24:v(3),active7:v(4),banned:v(5),blocked:v(6),books:v(7),hidden:v(8),reviews:v(9),threads:v(10),comments:v(11),pending:v(12),supportUnread:v(13),signups:r[14],reachable:v(15)});
},true);

/* ---------- admin: broadcasts ---------- */
const bcOut=b=>({id:b.id,text:b.text,audience:b.audience,status:b.status,total:b.total,sent:b.sent,failed:b.failed,created:b.created});
const recipientsSql="id GLOB '[0-9]*' AND banned=0 AND blocked=0";
route('GET','/api/admin/broadcasts',async c=>json({list:(await all(c,'SELECT * FROM broadcasts ORDER BY created DESC LIMIT 20')).map(bcOut),bot:!!c.env.BOT_TOKEN}),true);
route('POST','/api/admin/broadcasts',async c=>{
  if(!c.env.BOT_TOKEN)return bad(400,'no bot token');
  const text=clip(c.body.text,3500);if(text.length<2)return bad();
  const test=c.body.audience==='test',id='bc'+id8();
  const total=test?1:(await get(c,`SELECT COUNT(*) n FROM users WHERE ${recipientsSql}`)).n;
  await run(c,'INSERT INTO broadcasts VALUES(?,?,?,?,?,?,?,?,?,?)',id,text,test?'test':'all','running',total,0,0,test?c.user.id:'',Date.now(),c.user.id);
  return json({broadcast:bcOut(await get(c,'SELECT * FROM broadcasts WHERE id=?',id))});
},true);
/* One step sends to a small batch (stays under per-request subrequest limits); the admin UI calls it until done. */
route('POST','/api/admin/broadcasts/:id/step',async(c,id)=>{
  const b=await get(c,'SELECT * FROM broadcasts WHERE id=?',id);if(!b)return bad(404);
  if(b.status!=='running')return json({broadcast:bcOut(b)});
  const users=b.audience==='test'?(b.sent+b.failed?[]:[{id:b.created_by}]):await all(c,`SELECT id FROM users WHERE ${recipientsSql} AND id>? ORDER BY id LIMIT 20`,b.cursor||'');
  let sent=0,failed=0;const dead=[];
  for(let i=0;i<users.length;i+=10)await Promise.all(users.slice(i,i+10).map(async u=>{
    const r=await tgApi(c.env,'sendMessage',{chat_id:u.id,text:b.text,...openBtn(c.env)});
    if(r&&r.ok)sent++;else{failed++;if(r&&(r.status===403||r.status===400))dead.push(u.id)}}));
  for(const d of dead)await run(c,'UPDATE users SET blocked=1 WHERE id=?',d);
  const cursor=users.length?users[users.length-1].id:b.cursor,done=b.audience==='test'||users.length<20;
  await run(c,'UPDATE broadcasts SET sent=sent+?,failed=failed+?,cursor=?,status=? WHERE id=?',sent,failed,cursor,done?'done':'running',id);
  return json({broadcast:bcOut(await get(c,'SELECT * FROM broadcasts WHERE id=?',id))});
},true);
route('POST','/api/admin/broadcasts/:id/cancel',async(c,id)=>{await run(c,"UPDATE broadcasts SET status='cancelled' WHERE id=? AND status='running'",id);return json({ok:true})},true);

/* ---------- admin: support inbox ---------- */
route('GET','/api/admin/support',async c=>{
  const rows=await all(c,`SELECT m.user_id,u.name,
    (SELECT text FROM support_messages WHERE user_id=m.user_id ORDER BY id DESC LIMIT 1) last,
    MAX(m.created) at,SUM(CASE WHEN m.from_admin=0 AND m.read=0 THEN 1 ELSE 0 END) unread
    FROM support_messages m LEFT JOIN users u ON u.id=m.user_id GROUP BY m.user_id ORDER BY unread DESC,at DESC LIMIT 100`);
  return json({list:rows.map(r=>({userId:r.user_id,name:r.name||r.user_id,last:r.last,at:r.at,unread:r.unread}))});
},true);
route('GET','/api/admin/support/:uid',async(c,uid)=>{
  const msgs=await all(c,'SELECT id,from_admin,text,created FROM support_messages WHERE user_id=? ORDER BY id DESC LIMIT 200',uid);
  await run(c,'UPDATE support_messages SET read=1 WHERE user_id=? AND from_admin=0 AND read=0',uid);
  const u=await get(c,'SELECT name FROM users WHERE id=?',uid);
  return json({name:u?.name||uid,messages:msgs.reverse().map(m=>({id:m.id,mine:!!m.from_admin,text:m.text,at:m.created}))});
},true);
route('POST','/api/admin/support/:uid',async(c,uid)=>{
  const text=clip(c.body.text,2000);if(!text||!await get(c,'SELECT 1 x FROM users WHERE id=?',uid))return bad();
  await run(c,'INSERT INTO support_messages(user_id,from_admin,text,created,read) VALUES(?,?,?,?,0)',uid,1,text,Date.now());
  notify(c,uid,`💬 Поддержка Muloqot Books: ${text}`);return json({ok:true});
},true);

/* ---------- admin: users ---------- */
route('GET','/api/admin/users',async c=>{
  const sp=new URL(c.request.url).searchParams,q=clip(sp.get('q'),40),off=Math.max(0,+sp.get('offset')||0);
  const adm=new Set(await adminIds(c));
  const rows=await all(c,"SELECT id,name,created,last_seen,banned,blocked FROM users WHERE (?1='' OR id LIKE ?2 OR name LIKE ?2) ORDER BY COALESCE(last_seen,created) DESC LIMIT 30 OFFSET ?3",q,'%'+q+'%',off);
  return json({list:rows.map(u=>({...u,banned:!!u.banned,blocked:!!u.blocked,admin:adm.has(u.id),root:csv(c.env.ADMIN_IDS).includes(u.id)})),more:rows.length===30});
},true);
route('POST','/api/admin/users/:id/ban',async(c,id)=>{
  if(csv(c.env.ADMIN_IDS).includes(id)||id===c.user.id)return bad(400,'protected');
  await run(c,'UPDATE users SET banned=? WHERE id=?',c.body.on?1:0,id);return json({ok:true});
},true);
route('POST','/api/admin/users/:id/admin',async(c,id)=>{
  if(csv(c.env.ADMIN_IDS).includes(id))return bad(400,'protected');
  if(c.body.on)await run(c,'INSERT OR IGNORE INTO admins VALUES(?,?,?)',id,c.user.id,Date.now());else await run(c,'DELETE FROM admins WHERE user_id=?',id);
  return json({ok:true});
},true);
/* Add an admin by Telegram ID before they ever opened the app. */
route('POST','/api/admin/admins',async c=>{
  const id=clip(c.body.id,20).replace(/\D/g,'');if(!id)return bad();
  await run(c,'INSERT INTO users(id,name,created) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING',id,null,Date.now());
  await run(c,'INSERT OR IGNORE INTO admins VALUES(?,?,?)',id,c.user.id,Date.now());return json({ok:true});
},true);

/* ---------- admin: content ---------- */
route('GET','/api/admin/books',async c=>json({list:(await all(c,'SELECT id,data,added,hidden FROM books ORDER BY added DESC')).map(r=>{const b=P(r.data);return{id:r.id,title:b.title,desc:b.desc,author:b.a,lang:b.lang,hidden:!!r.hidden,chapters:b.chapters.length}})}),true);
route('POST','/api/admin/books/:id/hide',async(c,id)=>{await run(c,'UPDATE books SET hidden=? WHERE id=?',c.body.on?1:0,id);return json({ok:true})},true);
route('POST','/api/admin/books/:id/delete',async(c,id)=>{
  await batch(c,[stmt(c,'DELETE FROM books WHERE id=?',id),stmt(c,'DELETE FROM ratings WHERE book_id=?',id),stmt(c,'DELETE FROM reviews WHERE book_id=?',id)]);return json({ok:true});
},true);
route('POST','/api/admin/books/:id/edit',async(c,id)=>{
  const row=await get(c,'SELECT data FROM books WHERE id=?',id);if(!row)return bad(404);
  const b=P(row.data),title=clip(c.body.title,120),desc=clip(c.body.desc,3000);if(title.length<2)return bad();
  b.title=title;if(desc)b.desc=desc;await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);return json({ok:true});
},true);
route('POST','/api/admin/reviews/:id/delete',async(c,id)=>{await batch(c,[stmt(c,'DELETE FROM reviews WHERE id=?',id),stmt(c,'DELETE FROM review_replies WHERE review_id=?',id)]);return json({ok:true})},true);
route('POST','/api/admin/threads/:id/delete',async(c,id)=>{await batch(c,[stmt(c,'DELETE FROM threads WHERE id=?',id),stmt(c,'DELETE FROM comments WHERE thread_id=?',id)]);return json({ok:true})},true);
route('POST','/api/admin/comments/:id/delete',async(c,id)=>{await run(c,'DELETE FROM comments WHERE id=? OR parent_id=?',id,id);return json({ok:true})},true);
route('POST','/api/admin/weekly',async c=>{
  const bookId=c.body.bookId,ru=clip(c.body.ru,300),uz=clip(c.body.uz,300);if(!ru||!await get(c,'SELECT 1 x FROM books WHERE id=?',bookId))return bad();
  await run(c,"INSERT INTO meta VALUES('weekly',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",J({bookId,q:{ru,uz:uz||ru}}));return json({ok:true});
},true);
route('POST','/api/admin/collections',async c=>{
  const pals=[['#3a1d14','#a2431f'],['#10282c','#2f6672'],['#2a1f12','#8a5a22'],['#26141a','#7a3346']];
  const list=(Array.isArray(c.body.list)?c.body.list:[]).slice(0,30).map((x,i)=>({id:clip(x.id,12)||'c'+id8(),ids:(Array.isArray(x.ids)?x.ids:[]).slice(0,60).map(String),t:{ru:clip(x.t?.ru,60),uz:clip(x.t?.uz,60)||clip(x.t?.ru,60)},pal:Array.isArray(x.pal)&&x.pal.length===2?x.pal.map(p=>clip(p,9)):pals[i%4]})).filter(x=>x.t.ru&&x.ids.length);
  await run(c,"INSERT INTO meta VALUES('collections',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",J(list));return json({ok:true});
},true);

/* ---------- entry points ---------- */
async function handleApi(request,env,ctx){
  const c={env,ctx,request,body:{}};
  const dev=!env.BOT_TOKEN;let u=null;const h=request.headers.get('authorization')||'';
  if(h.startsWith('tma '))u=await verifyInitData(h.slice(4),env.BOT_TOKEN||'');
  else if(dev&&request.headers.get('x-dev-user'))u={id:clip(request.headers.get('x-dev-user'),32).replace(/[^\w-]/g,''),first_name:'Dev'};
  if(!u||!u.id)return bad(401,'unauthorized');
  const id=String(u.id),name=clip([u.first_name,u.last_name].filter(Boolean).join(' ')||u.username||'Reader',40);
  await ensureSchema(env);
  c.user={id,name};
  c.user.superadmin=csv(env.ADMIN_IDS).includes(id)||(dev&&id==='admin');
  c.user.admin=c.user.superadmin||!!await get(c,'SELECT 1 x FROM admins WHERE user_id=?',id);
  const url=new URL(request.url);
  for(const r of routes){
    if(r.method!==request.method)continue;const m=r.re.exec(url.pathname);if(!m)continue;
    if(r.admin&&!c.user.admin)return bad(403,'forbidden');
    if(request.method!=='GET'){try{c.body=await request.json()}catch{c.body={}}}
    await run(c,'INSERT INTO users(id,name,created,last_seen) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=COALESCE(users.name,excluded.name),last_seen=excluded.last_seen,blocked=0',id,name,Date.now(),Date.now());
    if((await get(c,'SELECT banned FROM users WHERE id=?',id))?.banned&&!c.user.superadmin)return bad(403,'banned');
    return r.fn(c,...m.slice(1));
  }
  return bad(404,'not found');
}

async function handleWebhook(request,env,ctx){
  if(!env.WEBHOOK_SECRET||request.headers.get('x-telegram-bot-api-secret-token')!==env.WEBHOOK_SECRET)return new Response('forbidden',{status:403});
  const u=await request.json().catch(()=>null),m=u?.message;
  if(m?.text?.startsWith('/start'))ctx.waitUntil(tgApi(env,'sendMessage',{chat_id:m.chat.id,text:'Muloqot Books — русская и узбекская литература. Откройте приложение:',...openBtn(env)}));
  return new Response('ok');
}

/** Daily 19:00 Tashkent (14:00 UTC): remind readers who have not opened a book today. */
async function reminders(env,ctx){
  const c={env,ctx};const today=new Date(Date.now()+5*36e5).toISOString().slice(0,10);
  for(const u of await all(c,"SELECT id,state FROM users WHERE state LIKE '%\"reminder\":true%'")){
    const s=P(u.state||'{}');if(s.notif?.reminder&&!(s.days||[]).includes(today))notify(c,u.id,'Время почитать 📖 Сегодня вы ещё не открывали книгу.');
  }
}

export default {
  async fetch(request,env,ctx){
    const {pathname}=new URL(request.url);
    try{
      if(pathname==='/telegram/webhook'&&request.method==='POST')return await handleWebhook(request,env,ctx);
      if(pathname.startsWith('/api/'))return await handleApi(request,env,ctx);
    }catch(e){console.error(e);return json({error:'server'},500)}
    return env.ASSETS.fetch(request);
  },
  scheduled(event,env,ctx){ctx.waitUntil(reminders(env,ctx))}
};
