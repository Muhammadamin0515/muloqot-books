import {parseManuscript} from './parse.js';
import {ensureSchema} from './schema.js';
import {COVER_STYLES} from './covers.js';
import {GENRES,RIGHTS_OK,RIGHTS_ALL,MAX_TEXT_BYTES,MAX_COVER_CHARS,canRead,rightsOf,publicRights,validateImport,fetchCover,popularity,isDemo,checkTextRights,cleanRights,httpsUrl,hasText,isPublished} from './catalog.js';
import {registerLibrary,tokenCheck} from './library.js';
import {registerAi} from './ai.js';

const J=JSON.stringify,P=s=>JSON.parse(s);
const clip=(s,n)=>String(s??'').trim().slice(0,n);
const id8=()=>crypto.randomUUID().slice(0,8);
const LOCAL=['state','reviews','threads','subs','reacts','qLikes','follows','ratings','progress','bookmarks','outbox'];
let LIB;
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
const tgApi=(env,method,body)=>env.BOT_TOKEN?fetch(`${env.TG_API||'https://api.telegram.org'}/bot${env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:J(body)}).catch(()=>null):Promise.resolve(null);
const tgJson=async(env,method,body)=>{const r=await tgApi(env,method,body);return r?r.json().catch(()=>null):null};
/** Derived from the bot token, so no extra secret has to be configured. */
const webhookSecret=async env=>hex(await hmac(new TextEncoder().encode(env.BOT_TOKEN||''),new TextEncoder().encode('muloqot-webhook'))).slice(0,48);
let ORIGIN='';
const baseUrl=env=>(env.WEBAPP_URL||ORIGIN||'').replace(/\/$/,'');
const openBtn=(env,{lang='ru',open=''}={})=>{const b=baseUrl(env);return b?{reply_markup:{inline_keyboard:[[{text:lang==='uz'?'📖 Ilovani ochish':'📖 Открыть приложение',web_app:{url:open?`${b}/?open=${open}`:b}}]]}}:{}};
const DEFAULT_WELCOME={
  ru:'📚 Добро пожаловать в Muloqot Books!\n\nТвой мир книг, вдохновения и новых открытий.\n\n✨ Здесь ты сможешь:\n📖 Находить и читать книги целиком\n🌍 Открывать литературу на русском и узбекском\n⭐ Оценивать книги и делиться отзывами\n💬 Обсуждать истории с другими читателями\n❤️ Сохранять любимые книги и продолжать чтение с того места, где остановился\n\nКаждая книга — это новый мир. Найди свою историю!\n\n👇 Нажми «Открыть приложение» и начни читать.',
  uz:'📚 Muloqot Books’ga xush kelibsiz!\n\nKitoblar, ilhom va yangi kashfiyotlar dunyosi.\n\n✨ Bu yerda siz:\n📖 Kitoblarni to‘liq topib o‘qiysiz\n🌍 Rus va o‘zbek adabiyotini kashf etasiz\n⭐ Kitoblarni baholab, sharh qoldirasiz\n💬 Boshqa o‘quvchilar bilan hikoyalarni muhokama qilasiz\n❤️ Sevimli kitoblaringizni saqlab, to‘xtagan joyingizdan davom etasiz\n\nHar bir kitob — yangi dunyo. O‘z hikoyangizni toping!\n\n👇 «Ilovani ochish» tugmasini bosing va o‘qishni boshlang.'};
const getWelcome=async(c,lang='ru')=>{const r=await get(c,"SELECT value FROM meta WHERE key=?",lang==='uz'?'welcomeUz':'welcome');return r?P(r.value).text:DEFAULT_WELCOME[lang]};
const COMMANDS={
  ru:[['start','Начать'],['library','Моя библиотека'],['donate','Поддержать проект'],['support','Написать в поддержку'],['notifications','Уведомления'],['help','Помощь']],
  uz:[['start','Boshlash'],['library','Kutubxonam'],['donate','Loyihani qo‘llab-quvvatlash'],['support','Yordam'],['notifications','Bildirishnomalar'],['help','Ma’lumot']]};
/** Registers the command list, the "Читать" menu button and the Uzbek description. Idempotent. */
async function setupBot(env){
  const base=baseUrl(env),cmd=l=>COMMANDS[l].map(([command,description])=>({command,description}));
  const r=await Promise.all([
    tgJson(env,'setMyCommands',{commands:cmd('ru')}),
    tgJson(env,'setMyCommands',{commands:cmd('uz'),language_code:'uz'}),
    base?tgJson(env,'setChatMenuButton',{menu_button:{type:'web_app',text:'📖 Читать',web_app:{url:base}}}):{ok:true},
    tgJson(env,'setMyDescription',{description:'Muloqot Books — rus va o‘zbek tilidagi kitoblar: o‘qing, baholang, muhokama qiling. «Ilovani ochish» tugmasini bosing.',language_code:'uz'}),
    tgJson(env,'setMyShortDescription',{short_description:'Rus va o‘zbek tilidagi kitoblar: o‘qing, baholang, muhokama qiling.',language_code:'uz'})]);
  return r.every(x=>x&&x.ok);
}
/** Bot message to a Telegram user (their id is the private chat id). No-op without BOT_TOKEN or for dev users. */
const notify=(c,userId,text,o={})=>{if(!c.env.BOT_TOKEN||!/^\d+$/.test(String(userId||'')))return;c.ctx.waitUntil(tgApi(c.env,'sendMessage',{chat_id:userId,text,...(o.silent?{disable_notification:true}:{}),...(o.button===false?{}:openBtn(c.env,{open:o.open||''}))}))};

/* ---------- D1 helpers ---------- */
const stmt=(c,sql,...a)=>c.env.DB.prepare(sql).bind(...a.map(x=>x===undefined?null:x));
const all=async(c,sql,...a)=>(await stmt(c,sql,...a).all()).results;
const get=(c,sql,...a)=>stmt(c,sql,...a).first();
const run=(c,sql,...a)=>stmt(c,sql,...a).run();
const batch=async(c,list)=>(await c.env.DB.batch(list)).map(r=>r.results);

const adminIds=async c=>[...new Set([...csv(c.env.ADMIN_IDS),...(await all(c,'SELECT user_id FROM admins')).map(r=>r.user_id)])];
/* Admin notifications are quiet by default: no "open" button, optionally silent, and each type can be turned off in the panel. */
const ADMIN_NOTIF_DEFAULT={support:'off',submissions:'silent',reports:'silent',donations:'silent'};
const getAdminNotif=async c=>{const r=await get(c,"SELECT value FROM meta WHERE key='adminNotif'");return{...ADMIN_NOTIF_DEFAULT,...(r?P(r.value):{})}};
const notifyAdmins=async(c,type,text)=>{const mode=(await getAdminNotif(c))[type];if(mode==='off')return;for(const a of await adminIds(c))notify(c,a,text,{button:false,silent:mode==='silent'})};
const personName=(name,id)=>/[\p{L}\p{N}]/u.test(name||'')?name:`пользователь ${id}`;
const rel=ms=>{const m=Math.max(0,Math.floor((Date.now()-ms)/6e4));
  if(m<2)return{ru:'только что',uz:'hozirgina'};if(m<60)return{ru:`${m} мин назад`,uz:`${m} daqiqa oldin`};
  const h=Math.floor(m/60);if(h<24)return{ru:`${h} ч назад`,uz:`${h} soat oldin`};
  const d=Math.floor(h/24);if(d<14)return{ru:`${d} дн. назад`,uz:`${d} kun oldin`};
  const w=Math.floor(d/7);return{ru:`${w} нед. назад`,uz:`${w} hafta oldin`}};

/* ---------- serializers (bulk, a handful of queries per request) ---------- */
function bookOut(row,agg,extra={}){const b=P(row.data);const a=agg[row.id]||{n:0,s:0};
  /* Real ratings only. The base numbers stored with the test (demo) books are used for demo books and never mixed into real ones. */
  const base=isDemo(b)?b.count||0:0,count=base+a.n,rating=count?Math.round(((isDemo(b)?b.rating*base:0)+a.s)/count*100)/100:0;
  const full=canRead(b);
  /* The catalog list stays small: chapter text is fetched on demand (/api/books/:id/chapter/:n) and covers are served as images (/api/cover/:id). */
  const {rights,chapters,img,lit,pendingToc,pendingNch,pendingChars,...rest}=b;
  return{...rest,chapters:full&&!b.lazy?chapters.map(ch=>({t:ch.t})):[],nch:b.lazy?b.nch:chapters.length,ver:b.ver||'',fullText:full&&hasText(b),rights:publicRights(b),...(lit?{collection:lit.collection}:{}),...(img?{img:`/api/cover/${row.id}?v=${img.length}`}:{}),count,rating,pop:extra.pop||0,audio:extra.audio||0,dist:a.d||[0,0,0,0,0]}}
const DIST=',SUM(value=1) c1,SUM(value=2) c2,SUM(value=3) c3,SUM(value=4) c4,SUM(value=5) c5';
const distOf=r=>[r.c1,r.c2,r.c3,r.c4,r.c5].map(x=>x||0);
const ratingAgg=async c=>{const o={};(await all(c,`SELECT book_id,COUNT(*) n,SUM(value) s${DIST} FROM ratings GROUP BY book_id`)).forEach(r=>o[r.book_id]={n:r.n,s:r.s,d:distOf(r)});return o};
const pubBook=(c,id)=>get(c,"SELECT 1 x FROM books WHERE id=? AND json_extract(data,'$.publish') IS NOT 'draft'",id);
const bookById=async(c,id)=>{const row=await get(c,'SELECT * FROM books WHERE id=?',id);if(!row)return null;const a=await get(c,`SELECT COUNT(*) n,COALESCE(SUM(value),0) s${DIST} FROM ratings WHERE book_id=?`,id);return bookOut(row,{[id]:{n:a.n,s:a.s,d:distOf(a)}})};

async function loadReviews(c,onlyId,realOnly){
  const w=onlyId?' WHERE id=?':` WHERE (hidden=0 OR hidden IS NULL)${realOnly?` AND demo IS NOT 1 AND book_id IN ${REAL_BOOK}`:''}`,args=onlyId?[onlyId]:[];
  const patronMin=(await getDonateSettings(c)).patronMin;
  const [rv,rp,rc,mine,pat]=await batch(c,[
    stmt(c,`SELECT * FROM reviews${w} ORDER BY created DESC LIMIT 200`,...args),
    stmt(c,'SELECT review_id,user_name,text,is_author FROM review_replies ORDER BY id'),
    stmt(c,"SELECT target,kind,COUNT(*) n FROM reacts WHERE target LIKE 'r:%' GROUP BY target,kind"),
    stmt(c,"SELECT target,kind FROM reacts WHERE user_id=? AND target LIKE 'r:%'",c.user.id),
    stmt(c,"SELECT user_id FROM donations WHERE status='paid' AND user_id IS NOT NULL GROUP BY user_id HAVING SUM(amount)>=?",patronMin)]);
  const patrons=new Set(pat.map(x=>x.user_id));
  const cnt={};rc.forEach(x=>cnt[x.target+x.kind]=x.n);
  return rv.map(r=>{const t='r:'+r.id;const my={};mine.filter(m=>m.target===t).forEach(m=>my[m.kind]=true);
    return{id:r.id,bookId:r.book_id,user:r.user_name,rating:r.rating,text:r.text,date:rel(r.created),mine:r.user_id===c.user.id,patron:patrons.has(r.user_id),
      likes:r.likes_base+(cnt[t+'heart']||0),insight:r.insight_base+(cnt[t+'insight']||0),my,
      replies:rp.filter(x=>x.review_id===r.id).map(x=>({user:x.user_name,text:x.text,...(x.is_author?{author:1}:{})}))}});
}
async function loadThreads(c,onlyId,realOnly){
  const w=onlyId?' WHERE id=?':` WHERE (hidden=0 OR hidden IS NULL)${realOnly?` AND demo IS NOT 1 AND (book_id IS NULL OR book_id IN ${REAL_BOOK})`:''}`,args=onlyId?[onlyId]:[];
  const [th,cs]=await batch(c,[stmt(c,`SELECT * FROM threads${w} ORDER BY created DESC LIMIT 100`,...args),stmt(c,onlyId?'SELECT * FROM comments WHERE thread_id=? AND (hidden=0 OR hidden IS NULL) ORDER BY id':'SELECT * FROM comments WHERE hidden=0 OR hidden IS NULL ORDER BY id',...args)]);
  return th.map(t=>{const mine=cs.filter(x=>x.thread_id===t.id);
    return{id:t.id,bookId:t.book_id,title:t.title,user:t.user_name,text:t.text,mine:t.user_id===c.user.id,
      comments:mine.filter(x=>!x.parent_id).map(x=>({id:x.id,user:x.user_name,text:x.text,mine:x.user_id===c.user.id,replies:mine.filter(y=>y.parent_id===x.id).map(y=>({user:y.user_name,text:y.text}))}))}});
}
async function loadQuotes(c,onlyId,realOnly){
  const [qs,rc,mine]=await batch(c,[
    stmt(c,`SELECT * FROM quotes${onlyId?' WHERE id=?':(realOnly?` WHERE demo IS NOT 1 AND book_id IN ${REAL_BOOK}`:'')}`,...(onlyId?[onlyId]:[])),
    stmt(c,"SELECT target,COUNT(*) n FROM reacts WHERE target LIKE 'q:%' AND kind='heart' GROUP BY target"),
    stmt(c,"SELECT target FROM reacts WHERE user_id=? AND target LIKE 'q:%' AND kind='heart'",c.user.id)]);
  return qs.map(q=>({id:q.id,bookId:q.book_id,text:q.text,likes:q.likes_base+(rc.find(x=>x.target==='q:'+q.id)?.n||0),mine:mine.some(x=>x.target==='q:'+q.id)}));
}
const subOut=s=>({id:s.id,title:s.title,status:s.status,note:s.note||'',bookId:s.book_id||null,update:!!s.update_book_id});

/* ---------- routes ---------- */
const routes=[];
const route=(method,path,fn,admin)=>routes.push({method,re:new RegExp('^'+path.replace(/:\w+/g,'([^/]+)')+'$'),fn,admin});
const json=(o,status=200)=>new Response(J(o),{status,headers:{'content-type':'application/json'}});
const bad=(s=400,e='invalid')=>json({error:e},s);

/** Test (demo) content is hidden once the catalog has real books; the admin can force it on or off. */
const demoVisible=async c=>{
  const r=await get(c,"SELECT value FROM meta WHERE key='showDemo'"),v=r?P(r.value):'auto';
  if(v===true||v===false)return v;
  return !(await get(c,"SELECT 1 x FROM books WHERE json_extract(data,'$.demo') IS NOT 1 AND json_extract(data,'$.publish') IS NOT 'draft' AND (hidden=0 OR hidden IS NULL) LIMIT 1"));
};
const REAL_BOOK="(SELECT id FROM books WHERE json_extract(data,'$.demo') IS NOT 1)";
route('GET','/api/bootstrap',async c=>{
  const uid=c.user.id,demo=await demoVisible(c),since=new Date(Date.now()-29*864e5).toISOString().slice(0,10);
  const [books,authors,fol,meta,sub,usr,my1,my2,stats,aud]=await batch(c,[
    stmt(c,`SELECT * FROM books WHERE (hidden=0 OR hidden IS NULL) AND json_extract(data,'$.publish') IS NOT 'draft'${demo?'':" AND json_extract(data,'$.demo') IS NOT 1"}`),
    stmt(c,`SELECT * FROM authors${demo?'':" WHERE json_extract(data,'$.demo') IS NOT 1"}`),stmt(c,'SELECT author_id,COUNT(*) n FROM follows GROUP BY author_id'),
    stmt(c,'SELECT key,value FROM meta'),stmt(c,"SELECT * FROM submissions WHERE user_id=? AND status<>'withdrawn' ORDER BY created DESC",uid),
    stmt(c,'SELECT state FROM users WHERE id=?',uid),stmt(c,'SELECT book_id,value FROM ratings WHERE user_id=?',uid),stmt(c,'SELECT author_id FROM follows WHERE user_id=?',uid),
    stmt(c,'SELECT book_id,SUM(views) v,SUM(reads) r,SUM(finishes) f FROM book_stats WHERE day>=? GROUP BY book_id',since),
    stmt(c,'SELECT book_id,COUNT(*) n FROM audio_tracks GROUP BY book_id')]);
  const [progress,bookmarks]=[await LIB.progressOf(c),await LIB.bookmarksOf(c)];
  const agg=await ratingAgg(c),m=Object.fromEntries(meta.map(x=>[x.key,P(x.value)]));
  const sup=await get(c,'SELECT COUNT(*) n FROM support_messages WHERE user_id=? AND from_admin=1 AND read=0',uid);
  const don=await get(c,"SELECT COALESCE(SUM(amount),0) s FROM donations WHERE status='paid' AND user_id=?",uid),ds=await getDonateSettings(c),goals=await goalRows(c);
  const st=Object.fromEntries(stats.map(x=>[x.book_id,{views:x.v,reads:x.r,finishes:x.f}])),au=Object.fromEntries(aud.map(x=>[x.book_id,x.n]));
  const out=books.map(b=>bookOut(b,agg,{pop:popularity(st[b.id]||{},agg[b.id]?.n),audio:au[b.id]||0})),ids=new Set(out.map(b=>b.id));
  const collections=(m.collections||[]).map(x=>({...x,ids:x.ids.filter(i=>ids.has(i))})).filter(x=>x.ids.length);
  return json({me:{id:uid,name:c.user.name,admin:c.user.admin,superadmin:c.user.superadmin,supportUnread:sup.n,donated:don.s,patron:don.s>=ds.patronMin},donateGoal:goals[0]||null,donateOn:!!c.env.BOT_TOKEN,appLink:m.applink||'',demo,
    books:out,
    authors:authors.map(a=>({...P(a.data),followers:a.followers_base+(fol.find(f=>f.author_id===a.id)?.n||0)})),
    collections,weekly:m.weekly&&ids.has(m.weekly.bookId)?m.weekly:null,quotes:await loadQuotes(c,null,!demo),reviews:await loadReviews(c,null,!demo),threads:await loadThreads(c,null,!demo),
    ratings:Object.fromEntries(my1.map(r=>[r.book_id,r.value])),follows:my2.map(r=>r.author_id),subs:sub.map(subOut),progress,bookmarks,state:P(usr[0]?.state||'{}')});
});
/* Full text is served only for books whose distribution rights are confirmed (or demo books). Admins can always preview. */
route('GET','/api/books/:id/text',async(c,id)=>{
  const row=await get(c,'SELECT data,hidden FROM books WHERE id=?',id);
  if(!row||(row.hidden&&!c.user.admin))return bad(404);
  const b=P(row.data);
  if(b.publish==='draft'&&!c.user.admin)return bad(404);
  if(!canRead(b)&&!c.user.admin)return bad(403,'rights');
  if(b.lazy)return json({lazy:true,chapters:[]});   // collection books are read chapter by chapter: /api/books/:id/toc and /chapter/:n
  return new Response(J({chapters:b.chapters}),{headers:{'content-type':'application/json','cache-control':'private, max-age=3600'}});
});
route('PUT','/api/state',async c=>{
  const s={...c.body};LOCAL.forEach(k=>delete s[k]);const txt=J(s);
  if(txt.length>300_000)return bad(413,'too large');
  await run(c,'UPDATE users SET state=? WHERE id=?',txt,c.user.id);return json({ok:true});
});
/* ---------- spam protection ---------- */
const URL_RE=/(https?:\/\/|www\.|t\.me\/|[a-z0-9-]+\.(com|ru|uz|org|net|me|io|xyz)\b)/i;
const getStopwords=async c=>{const r=await get(c,"SELECT value FROM meta WHERE key='stopwords'");return r?P(r.value):[]};
/** Returns an error response when a post looks like spam; admins are exempt. */
async function guardPost(c,text){
  if(c.user.admin)return null;
  const now=Date.now();
  await run(c,'INSERT INTO actions VALUES(?,?)',c.user.id,now);
  if(Math.random()<0.05)await run(c,'DELETE FROM actions WHERE ts<?',now-36e5);
  const a=await get(c,'SELECT SUM(CASE WHEN ts>? THEN 1 ELSE 0 END) m,COUNT(*) h FROM actions WHERE user_id=? AND ts>?',now-6e4,c.user.id,now-36e5);
  if(a.m>6||a.h>60)return bad(429,'rate');
  if(URL_RE.test(text))return bad(422,'links');
  const low=text.toLowerCase();
  if((await getStopwords(c)).some(w=>w&&low.includes(w)))return bad(422,'stopword');
  const dup=await get(c,'SELECT 1 x FROM reviews WHERE user_id=?1 AND text=?2 AND created>?3 UNION ALL SELECT 1 FROM comments WHERE user_id=?1 AND text=?2 AND created>?3 UNION ALL SELECT 1 FROM review_replies WHERE user_id=?1 AND text=?2 AND created>?3 LIMIT 1',c.user.id,text,now-6e5);
  if(dup)return bad(422,'duplicate');
  return null;
}
const upsertRating=(c,bookId,v)=>run(c,'INSERT INTO ratings VALUES(?,?,?) ON CONFLICT(user_id,book_id) DO UPDATE SET value=excluded.value',c.user.id,bookId,v);
route('POST','/api/books/:id/rate',async(c,id)=>{
  if(!await pubBook(c,id))return bad(404);
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
  if(!await pubBook(c,bookId)||!(rating>=1&&rating<=5)||text.length<10)return bad();
  const g1=await guardPost(c,text);if(g1)return g1;
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
  const g2=await guardPost(c,text);if(g2)return g2;
  const owner=await get(c,"SELECT a.user_id FROM books b JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE b.id=?",r.book_id);
  await run(c,'INSERT INTO review_replies(review_id,user_id,user_name,text,is_author,created) VALUES(?,?,?,?,?,?)',id,c.user.id,c.user.name,text,owner?.user_id===c.user.id?1:0,Date.now());
  if(r.user_id&&r.user_id!==c.user.id){const u=await get(c,'SELECT state FROM users WHERE id=?',r.user_id);const n=P(u?.state||'{}').notif;if(!n||n.replies!==false)notify(c,r.user_id,`${c.user.name} ответил(а) на ваш отзыв: «${text.slice(0,120)}»`)}
  return json({review:(await loadReviews(c,id))[0]});
});
route('POST','/api/threads',async c=>{
  const title=clip(c.body.title,200);if(!title)return bad();
  const g3=await guardPost(c,title);if(g3)return g3;
  const bookId=c.body.bookId&&await pubBook(c,c.body.bookId)?c.body.bookId:null;
  const id='t'+id8();await run(c,'INSERT INTO threads(id,book_id,user_id,user_name,title,text,created) VALUES(?,?,?,?,?,?,?)',id,bookId,c.user.id,c.user.name,title,'',Date.now());
  return json({thread:(await loadThreads(c,id))[0]});
});
route('POST','/api/threads/:id/comments',async(c,id)=>{
  const t=await get(c,'SELECT * FROM threads WHERE id=?',id),text=clip(c.body.text,1000);if(!t||!text)return bad();
  const g4=await guardPost(c,text);if(g4)return g4;
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
  const text=clip(c.body.text,500);if(!text||!await pubBook(c,c.body.bookId))return bad();
  const id='q'+id8();await run(c,'INSERT INTO quotes(id,book_id,text,likes_base) VALUES(?,?,?,0)',id,c.body.bookId,text);
  return json({quote:(await loadQuotes(c,id))[0]});
});

const byteLen=t=>new TextEncoder().encode(t).length;
route('POST','/api/submissions',async c=>{
  const b=c.body,title=clip(b.title,120),desc=clip(b.desc,1500),body=String(b.body||'');
  if(title.length<2)return bad(400,'title');
  if(desc.length<20)return bad(400,'desc');
  if(b.rights!==true)return bad(400,'rights');
  if(body.trim().length<500)return bad(400,'manuscript');
  if(byteLen(body)>MAX_TEXT_BYTES)return bad(413,'toolarge');
  if(!parseManuscript(body).length)return bad(400,'manuscript');
  if((await get(c,"SELECT COUNT(*) n FROM submissions WHERE user_id=? AND created>?",c.user.id,Date.now()-864e5)).n>=8)return bad(429,'ratelimit');
  let cover=null;
  if(typeof b.cover==='string'&&b.cover){
    if(!/^data:image\/(jpeg|png|webp);base64,/.test(b.cover))return bad(400,'coverformat');
    if(b.cover.length>MAX_COVER_CHARS)return bad(413,'coverlarge');
    cover=b.cover;
  }
  const style=Number.isInteger(b.style)&&b.style>=0&&b.style<COVER_STYLES.length?b.style:null;
  const id='s'+id8();
  await run(c,'INSERT INTO submissions(id,user_id,title,author_name,lang,genre,description,tags,cover,file_name,body,status,note,book_id,created,style) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,c.user.id,title,clip(b.author,60)||c.user.name,b.lang==='uz'?'uz':'ru',GENRES.includes(b.genre)?b.genre:'novel',desc,'',cover,clip(b.fileName,120),body,'moderation','',null,Date.now(),style);
  await notifyAdmins(c,'submissions',`Новая заявка на модерацию: «${title}»`);
  return json({sub:subOut(await get(c,'SELECT * FROM submissions WHERE id=?',id))});
});
/* The author's own submission, with the manuscript, so a rejected one can be fixed and sent again. */
route('GET','/api/submissions/:id',async(c,id)=>{
  const s=await get(c,'SELECT * FROM submissions WHERE id=? AND user_id=?',id,c.user.id);if(!s)return bad(404);
  return json({id:s.id,title:s.title,author:s.author_name,lang:s.lang,genre:s.genre,desc:s.description,cover:s.cover,style:s.style,fileName:s.file_name,body:s.body,status:s.status,note:s.note||''});
});
route('POST','/api/submissions/:id/withdraw',async(c,id)=>{
  const s=await get(c,"SELECT id FROM submissions WHERE id=? AND user_id=? AND status='moderation'",id,c.user.id);if(!s)return bad(404);
  await run(c,"UPDATE submissions SET status='withdrawn' WHERE id=?",id);return json({ok:true});
});
route('POST','/api/author/profile',async c=>{
  const a=await get(c,'SELECT * FROM authors WHERE user_id=?',c.user.id);if(!a)return bad(404,'noauthor');
  const d=P(a.data);
  d.city={ru:clip(c.body.cityRu,60),uz:clip(c.body.cityUz,60)||clip(c.body.cityRu,60)};
  d.bio={ru:clip(c.body.bioRu,600),uz:clip(c.body.bioUz,600)||clip(c.body.bioRu,600)};
  await run(c,'UPDATE authors SET data=? WHERE id=?',J(d),a.id);return json({ok:true});
});
route('GET','/api/author/profile',async c=>{
  const a=await get(c,'SELECT data FROM authors WHERE user_id=?',c.user.id);if(!a)return json({author:null});
  const d=P(a.data);return json({author:{name:d.name,cityRu:d.city?.ru||'',cityUz:d.city?.uz||'',bioRu:d.bio?.ru||'',bioUz:d.bio?.uz||''}});
});
route('GET','/api/admin/submissions',async c=>{
  const rows=await all(c,"SELECT id,title,status,note,book_id,author_name,lang,genre,description,LENGTH(body) chars,SUBSTR(body,1,900) preview,user_id,update_book_id,cover,style FROM submissions WHERE status='moderation' ORDER BY created");
  const out=[];
  for(const s of rows){
    const o={...subOut(s),author:s.author_name,lang:s.lang,genre:s.genre,desc:s.description,chars:s.chars,preview:s.preview,userId:s.user_id,cover:s.cover||null,style:s.style};
    if(!s.update_book_id)o.chapters=parseManuscript((await get(c,'SELECT body FROM submissions WHERE id=?',s.id)).body).length;
    if(s.update_book_id){const b=await get(c,'SELECT data FROM books WHERE id=?',s.update_book_id);
      if(b){const d=P(b.data);o.update={bookTitle:d.title,oldChapters:d.chapters.length,oldChars:d.chapters.reduce((n,x)=>n+x.p.join('').length,0),newChapters:parseManuscript((await get(c,'SELECT body FROM submissions WHERE id=?',s.id)).body).length,note:s.description}}}
    out.push(o);
  }
  return json(out);
},true);

route('POST','/api/admin/submissions/:id/reject',async(c,id)=>{
  const s=await get(c,"SELECT * FROM submissions WHERE id=? AND status='moderation'",id);if(!s)return bad(404);
  const note=clip(c.body.note,300);await run(c,"UPDATE submissions SET status='rejected',note=? WHERE id=?",note,id);
  notify(c,s.user_id,`${s.update_book_id?'Обновление книги':'Заявка'} «${s.title}» ${s.update_book_id?'отклонено':'отклонена'}.${note?' '+note:''}`);return json({ok:true});
},true);
route('POST','/api/admin/submissions/:id/approve',async(c,id)=>{
  const s=await get(c,"SELECT * FROM submissions WHERE id=? AND status='moderation'",id);if(!s)return bad(404);
  const chapters=parseManuscript(s.body);if(!chapters.length)return bad(400,'empty');
  if(s.update_book_id){
    const row=await get(c,'SELECT data FROM books WHERE id=?',s.update_book_id);if(!row)return bad(404,'book gone');
    const book=P(row.data);
    await snapshotBook(c,s.update_book_id,book);
    book.chapters=chapters;book.pages=Math.max(1,Math.round(chapters.reduce((n,x)=>n+x.p.join('').length,0)/1800));book.updated=Date.now();
    await batch(c,[stmt(c,'UPDATE books SET data=? WHERE id=?',J(book),s.update_book_id),stmt(c,"UPDATE submissions SET status='approved' WHERE id=?",s.id)]);
    notify(c,s.user_id,`Обновлённый текст книги «${book.title}» опубликован ✅`);
    return json({bookId:s.update_book_id});
  }
  let a=await get(c,"SELECT * FROM authors WHERE user_id=? OR lower(json_extract(data,'$.name'))=lower(?)",s.user_id,s.author_name);
  if(!a){const aid='a'+id8();const pal=[['#2a1a14','#7a2e17'],['#10282c','#2f6672'],['#26141a','#7a3346'],['#2a1f12','#8a5a22']][aid.charCodeAt(1)%4];
    await run(c,'INSERT INTO authors VALUES(?,?,?,?)',aid,J({id:aid,name:s.author_name,city:{ru:'',uz:''},hair:'short',hairc:'#2a1c12',skin:'#d3ab88',glasses:0,pal,bio:{ru:'',uz:''}}),0,s.user_id);
    a={id:aid}}
  const bid='b'+id8(),chars=chapters.reduce((n,x)=>n+x.p.join('').length,0);
  const h=[...s.id].reduce((x,ch)=>x+ch.charCodeAt(0),0),st=COVER_STYLES[Number.isInteger(s.style)&&s.style>=0&&s.style<COVER_STYLES.length?s.style:h%COVER_STYLES.length];
  const added=((await get(c,'SELECT COALESCE(MAX(added),0) m FROM books')).m)+1;
  const book={id:bid,a:a.id,title:s.title,lang:s.lang,genre:s.genre,rating:4,count:0,pages:Math.max(1,Math.round(chars/1800)),year:new Date().getFullYear(),added,motif:st.motif,pal:st.pal,desc:s.description,chapters,format:'text',rights:{status:'author',license:'author-original',source:{name:'Автор (загрузка в студии)',url:''},attestedBy:s.user_id,attestedAt:s.created,approvedBy:c.user.id,approvedAt:Date.now()},...(s.cover?{img:s.cover}:{})};
  await batch(c,[stmt(c,'INSERT INTO books(id,data,added) VALUES(?,?,?)',bid,J(book),added),stmt(c,"UPDATE submissions SET status='approved',book_id=? WHERE id=?",bid,id)]);
  notify(c,s.user_id,`Ваша книга «${s.title}» опубликована в каталоге. Поздравляем!`,{open:'book_'+bid});
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
  const unreadBefore=(await get(c,'SELECT COUNT(*) n FROM support_messages WHERE user_id=? AND from_admin=0 AND read=0',c.user.id)).n;
  await run(c,'INSERT INTO support_messages(user_id,from_admin,text,created,read) VALUES(?,?,?,?,0)',c.user.id,0,text,Date.now());
  if(!unreadBefore)await notifyAdmins(c,'support',`Новое сообщение в поддержку\n${personName(c.user.name,c.user.id)}: «${text.slice(0,200)}»`);
  return json({ok:true});
});

/* ---------- admin: overview ---------- */
/* What readers can see as real books: published, and not the demo sample. */
const PUB_REAL="json_extract(data,'$.publish') IS NOT 'draft' AND json_extract(data,'$.demo') IS NOT 1";
route('GET','/api/admin/stats',async c=>{
  const now=Date.now(),D=864e5;
  const Q=[
    ['users','SELECT COUNT(*) n FROM users'],['new24','SELECT COUNT(*) n FROM users WHERE created>?',now-D],['new7','SELECT COUNT(*) n FROM users WHERE created>?',now-7*D],
    ['active24','SELECT COUNT(*) n FROM users WHERE last_seen>?',now-D],['active7','SELECT COUNT(*) n FROM users WHERE last_seen>?',now-7*D],
    ['banned','SELECT COUNT(*) n FROM users WHERE banned=1'],['blocked','SELECT COUNT(*) n FROM users WHERE blocked=1'],
    ['books',`SELECT COUNT(*) n FROM books WHERE (hidden=0 OR hidden IS NULL) AND ${PUB_REAL}`],['hidden',`SELECT COUNT(*) n FROM books WHERE hidden=1 AND ${PUB_REAL}`],
    ['drafts',"SELECT COUNT(*) n FROM books WHERE json_extract(data,'$.publish')='draft'"],['demoBooks',"SELECT COUNT(*) n FROM books WHERE json_extract(data,'$.demo')=1"],
    ['reviews',`SELECT COUNT(*) n FROM reviews WHERE book_id IN (SELECT id FROM books WHERE ${PUB_REAL})`],['threads','SELECT COUNT(*) n FROM threads'],['comments','SELECT COUNT(*) n FROM comments'],
    ['pending',"SELECT COUNT(*) n FROM submissions WHERE status='moderation'"],
    ['reports',"SELECT COUNT(*) n FROM (SELECT 1 FROM reports WHERE status='open' GROUP BY kind,target)"],
    ['supportUnread','SELECT COUNT(DISTINCT user_id) n FROM support_messages WHERE from_admin=0 AND read=0'],
    ['reachable',"SELECT COUNT(*) n FROM users WHERE blocked=0 AND banned=0 AND id GLOB '[0-9]*'"]];
  const out={signups:[],errors:[]};
  /* each metric is isolated, so one failing query cannot blank the whole overview */
  await Promise.all(Q.map(async([k,sql,...a])=>{try{out[k]=(await get(c,sql,...a)).n}catch(e){out[k]=0;out.errors.push(k+': '+String(e.message||e).slice(0,120))}}));
  try{out.signups=await all(c,"SELECT date(created/1000,'unixepoch') d,COUNT(*) n FROM users WHERE created>? GROUP BY d ORDER BY d",now-14*D)}catch(e){out.errors.push('signups: '+String(e.message||e).slice(0,120))}
  try{const since=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
    const top=await all(c,"SELECT s.book_id,SUM(s.views) v,SUM(s.reads) r,SUM(s.finishes) f,json_extract(b.data,'$.title') t FROM book_stats s JOIN books b ON b.id=s.book_id WHERE s.day>=? AND json_extract(b.data,'$.publish') IS NOT 'draft' GROUP BY s.book_id ORDER BY v DESC LIMIT 15",since);
    out.top=top.map(x=>({id:x.book_id,title:x.t,views:x.v,reads:x.r,finishes:x.f}))}catch(e){out.top=[];out.errors.push('top: '+String(e.message||e).slice(0,100))}
  return json(out);
},true);

/* ---------- admin: broadcasts ---------- */
const bcOut=(b,votes)=>({id:b.id,text:b.text,audience:b.audience,status:b.status,total:b.total,sent:b.sent,failed:b.failed,created:b.created,kind:b.kind||'message',photo:b.photo&&b.photo.startsWith('bcm:')?'uploaded':b.photo||'',button:b.button?P(b.button):{type:'app'},options:b.options?P(b.options):[],lang:b.lang||'all',...(votes?{votes}:{})});
const recipientsSql="id GLOB '[0-9]*' AND banned=0 AND blocked=0";
/** Audience filter: everybody, or only readers whose app language is Russian or Uzbek. */
/* the app language is stored in the reader's state; readers who never chose one see Russian */
const audSql=lang=>lang==='uz'?" AND json_extract(state,'$.lang')='uz'":lang==='ru'?" AND COALESCE(json_extract(state,'$.lang'),'ru')<>'uz'":'';
const voteCounts=async(c,id,n)=>{const rows=await all(c,'SELECT opt,COUNT(*) n FROM survey_votes WHERE broadcast_id=? GROUP BY opt',id);return Array.from({length:n},(_,i)=>rows.find(r=>r.opt===i)?.n||0)};
route('GET','/api/admin/broadcasts',async c=>json({list:await Promise.all((await all(c,'SELECT * FROM broadcasts ORDER BY created DESC LIMIT 20')).map(async b=>bcOut(b,b.kind==='poll'?await voteCounts(c,b.id,(b.options?P(b.options):[]).length):null))),bot:!!c.env.BOT_TOKEN,reach:{all:(await get(c,`SELECT COUNT(*) n FROM users WHERE ${recipientsSql}`)).n,ru:(await get(c,`SELECT COUNT(*) n FROM users WHERE ${recipientsSql}${audSql('ru')}`)).n,uz:(await get(c,`SELECT COUNT(*) n FROM users WHERE ${recipientsSql}${audSql('uz')}`)).n}}),true);
route('POST','/api/admin/broadcasts',async c=>{
  if(!c.env.BOT_TOKEN)return bad(400,'no bot token');
  const kind=c.body.kind==='poll'?'poll':'message';
  let photo=httpsUrl(c.body.photo)||'',media=null;
  /* An uploaded picture is stored in broadcast_media and served at /api/bcmedia/<id>; Telegram downloads it from that address. */
  if(typeof c.body.photoData==='string'&&c.body.photoData){
    const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(c.body.photoData);
    if(!m||c.body.photoData.length>MAX_COVER_CHARS)return bad(422,'photo');
    try{atob(m[2])}catch{return bad(422,'photo')}
    media={id:crypto.randomUUID().replace(/-/g,'').slice(0,20),mime:m[1],data:m[2]};photo='bcm:'+media.id;
  }
  if(photo&&String(c.body.text||'').trim().length>1000)return bad(422,'caption_long');
  const text=clip(c.body.text,photo?1000:3500);if(text.length<2)return bad(422,'text');
  const lang=c.body.lang==='ru'||c.body.lang==='uz'?c.body.lang:'all';
  let options=[];
  if(kind==='poll'){options=(Array.isArray(c.body.options)?c.body.options:[]).map(o=>clip(o,40)).filter(Boolean).slice(0,6);if(options.length<2)return bad(422,'options')}
  const bt=c.body.button||{type:'app'};let button={type:'app'};
  if(kind==='message'){
    if(bt.type==='none')button={type:'none'};
    else if(bt.type==='link'){const url=httpsUrl(bt.url),label=clip(bt.text,30);if(!url||!label)return bad(422,'button');button={type:'link',text:label,url}}
    else if(bt.type==='book'){const label=clip(bt.text,30)||'📖',row=await pubBook(c,String(bt.bookId||''));if(!row)return bad(422,'book');button={type:'book',text:label,bookId:String(bt.bookId)}}
  }else button={type:'none'};
  const test=c.body.audience==='test',id='bc'+id8();
  const total=test?1:(await get(c,`SELECT COUNT(*) n FROM users WHERE ${recipientsSql}${audSql(lang)}`)).n;
  if(media)await run(c,'INSERT INTO broadcast_media(id,mime,data,created) VALUES(?,?,?,?)',media.id,media.mime,media.data,Date.now());
  await run(c,'INSERT INTO broadcasts(id,text,audience,status,total,sent,failed,cursor,created,created_by,kind,photo,button,options,lang) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,text,test?'test':'all','running',total,0,0,test?c.user.id:'',Date.now(),c.user.id,kind,photo,J(button),J(options),lang);
  return json({broadcast:bcOut(await get(c,'SELECT * FROM broadcasts WHERE id=?',id))});
},true);
/** The message of one broadcast as a Telegram API call: text or photo, with the chosen button (open app, link, a book) or survey answers. */
function bcPayload(c,b,chatId){
  const btn=b.button?P(b.button):{type:'app'},base=baseUrl(c.env);
  let markup={};
  if(b.kind==='poll'){const opts=P(b.options||'[]');markup={reply_markup:{inline_keyboard:opts.map((o,i)=>[{text:o,callback_data:`bv:${b.id}:${i}`}])}}}
  else if(btn.type==='app')markup=openBtn(c.env);
  else if(btn.type==='link')markup={reply_markup:{inline_keyboard:[[{text:btn.text,url:btn.url}]]}};
  else if(btn.type==='book'&&base)markup={reply_markup:{inline_keyboard:[[{text:btn.text,web_app:{url:`${base}/?open=book_${btn.bookId}`}}]]}};
  const photo=b.photo&&b.photo.startsWith('bcm:')?`${base}/api/bcmedia/${b.photo.slice(4)}`:b.photo;
  return photo?['sendPhoto',{chat_id:chatId,photo,caption:b.text,...markup}]:['sendMessage',{chat_id:chatId,text:b.text,...markup}];
}
/* One step sends to a small batch (stays under per-request subrequest limits); the admin UI calls it until done. */
route('POST','/api/admin/broadcasts/:id/step',async(c,id)=>{
  const b=await get(c,'SELECT * FROM broadcasts WHERE id=?',id);if(!b)return bad(404);
  if(b.status!=='running')return json({broadcast:bcOut(b)});
  const users=b.audience==='test'?(b.sent+b.failed?[]:[{id:b.created_by}]):await all(c,`SELECT id FROM users WHERE ${recipientsSql}${audSql(b.lang)} AND id>? ORDER BY id LIMIT 20`,b.cursor||'');
  let sent=0,failed=0;const dead=[];
  for(let i=0;i<users.length;i+=10)await Promise.all(users.slice(i,i+10).map(async u=>{
    const [m,body]=bcPayload(c,b,u.id),r=await tgApi(c.env,m,body);
    if(r&&r.ok)sent++;else{failed++;if(r&&(r.status===403||r.status===400))dead.push(u.id)}}));
  for(const d of dead)await run(c,'UPDATE users SET blocked=1 WHERE id=?',d);
  const cursor=users.length?users[users.length-1].id:b.cursor,done=b.audience==='test'||users.length<20;
  await run(c,'UPDATE broadcasts SET sent=sent+?,failed=failed+?,cursor=?,status=? WHERE id=?',sent,failed,cursor,done?'done':'running',id);
  return json({broadcast:bcOut(await get(c,'SELECT * FROM broadcasts WHERE id=?',id))});
},true);
route('POST','/api/admin/broadcasts/:id/cancel',async(c,id)=>{await run(c,"UPDATE broadcasts SET status='cancelled' WHERE id=? AND status='running'",id);return json({ok:true})},true);
route('GET','/api/admin/broadcasts/:id/results',async(c,id)=>{
  const b=await get(c,'SELECT * FROM broadcasts WHERE id=?',id);if(!b)return bad(404);const opts=b.options?P(b.options):[];
  return json({broadcast:bcOut(b,await voteCounts(c,id,opts.length))});
},true);

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
route('GET','/api/admin/books',async c=>json({list:(await all(c,'SELECT id,data,added,hidden FROM books ORDER BY added DESC')).map(r=>{const b=P(r.data),ri=rightsOf(b);return{id:r.id,title:b.title,desc:b.desc,author:b.a,lang:b.lang,hidden:!!r.hidden,chapters:b.lazy?b.nch:b.chapters.length,demo:isDemo(b),fullText:canRead(b)&&hasText(b),publish:b.publish==='draft'?'draft':'published',lazy:!!b.lazy,ver:b.ver||'',lit:b.lit?{collection:b.lit.collection,metaStatus:b.lit.metaStatus,review:b.lit.review||[],info:b.lit.info||[],path:b.lit.path,sourceUrl:b.lit.sourceUrl,commit:b.lit.commit,metaConfirmed:!!b.lit.metaConfirmed,dupOf:b.lit.dupOf||'',possibleDuplicate:b.lit.possibleDuplicate||''}:null,
  rights:{status:ri.status,license:ri.license||'',evidenceUrl:ri.evidenceUrl||'',note:ri.note||'',source:ri.source?.name||'',sourceUrl:ri.source?.url||'',legacy:!!ri.legacy,authorDeathYear:ri.authorDeathYear||null}}})}),true);
route('POST','/api/admin/books/:id/hide',async(c,id)=>{await run(c,'UPDATE books SET hidden=? WHERE id=?',c.body.on?1:0,id);return json({ok:true})},true);
route('POST','/api/admin/books/:id/delete',async(c,id)=>{
  await batch(c,[stmt(c,'DELETE FROM books WHERE id=?',id),stmt(c,'DELETE FROM ratings WHERE book_id=?',id),stmt(c,'DELETE FROM reviews WHERE book_id=?',id)]);return json({ok:true});
},true);
route('POST','/api/admin/books/:id/edit',async(c,id)=>{
  const row=await get(c,'SELECT data FROM books WHERE id=?',id);if(!row)return bad(404);
  const b=P(row.data),title=clip(c.body.title,120),desc=clip(c.body.desc,3000);if(title.length<2)return bad();
  b.title=title;if(desc)b.desc=desc;await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);return json({ok:true});
},true);
/* ---------- catalog administration: import, rights, demo content, audio ---------- */
const audit=(c,action,target,detail)=>run(c,'INSERT INTO audit_log(ts,user_id,action,target,detail) VALUES(?,?,?,?,?)',Date.now(),c.user.id,action,target,J(detail||{}).slice(0,2000));
route('GET','/api/admin/audit',async c=>json({list:await all(c,'SELECT ts,user_id,action,target,detail FROM audit_log ORDER BY id DESC LIMIT 60')}),true);
/** Imports up to 8 records. Text is stored only when the rights check passes; otherwise the record can only be a metadata-only card. */
route('POST','/api/admin/import',async c=>{
  const recs=Array.isArray(c.body.records)?c.body.records.slice(0,8):[];if(!recs.length)return bad(400,'empty');
  const results=[];
  for(const r of recs){
    const v=validateImport(r);if(v.error){results.push({title:clip(r?.title,60),error:v.error});continue}
    const dup=await get(c,"SELECT b.id FROM books b JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE lower(json_extract(b.data,'$.title'))=lower(?) AND lower(json_extract(a.data,'$.name'))=lower(?)",v.book.title,v.author.name);
    if(dup){results.push({title:v.book.title,error:'duplicate',id:dup.id});continue}
    let cover=null;
    if(/^data:image\/(jpeg|png|webp);base64,/.test(v.cover)&&v.cover.length<=MAX_COVER_CHARS)cover=v.cover;
    else if(v.coverUrl)try{cover=await fetchCover(v.coverUrl)}catch{cover=null}
    let a=await get(c,"SELECT id FROM authors WHERE lower(json_extract(data,'$.name'))=lower(?)",v.author.name);
    const aid=a?.id||'a'+id8(),bid='b'+id8(),h=[...bid].reduce((x,ch)=>x+ch.charCodeAt(0),0),st=COVER_STYLES[h%COVER_STYLES.length];
    const added=((await get(c,'SELECT COALESCE(MAX(added),0) m FROM books')).m)+1;
    const book={id:bid,a:aid,...v.book,rating:0,count:0,added,motif:st.motif,pal:st.pal,...(cover?{img:cover}:{}),imported:{by:c.user.id,at:Date.now()}};
    const ops=[stmt(c,'INSERT INTO books(id,data,added) VALUES(?,?,?)',bid,J(book),added)];
    if(!a)ops.push(stmt(c,'INSERT INTO authors(id,data,followers_base,user_id) VALUES(?,?,0,NULL)',aid,J({id:aid,name:v.author.name,city:v.author.city,hair:'short',hairc:'#2a1c12',skin:'#d3ab88',glasses:0,pal:[['#2a1a14','#7a2e17'],['#10282c','#2f6672'],['#26141a','#7a3346'],['#2a1f12','#8a5a22']][h%4],bio:v.author.bio,...(v.author.deathYear?{deathYear:v.author.deathYear}:{})})));
    await batch(c,ops);await audit(c,'import',bid,{title:v.book.title,rights:v.book.rights.status,fullText:v.book.chapters.length>0});
    results.push({title:v.book.title,id:bid,fullText:v.book.chapters.length>0,cover:!!cover});
  }
  return json({results});
},true);
/** Confirms or revokes the right to publish the full text. Revoking hides the text from readers immediately. */
route('POST','/api/admin/books/:id/rights',async(c,id)=>{
  const row=await get(c,'SELECT data FROM books WHERE id=?',id);if(!row)return bad(404);
  const b=P(row.data),r=cleanRights(c.body),death=Number.isInteger(c.body.authorDeathYear)?c.body.authorDeathYear:(b.rights?.authorDeathYear??null);
  if(death!==null)r.authorDeathYear=death;
  r.source={name:clip(c.body.sourceName,80)||b.rights?.source?.name||'',url:httpsUrl(c.body.sourceUrl)||b.rights?.source?.url||''};
  if(hasText(b)&&RIGHTS_OK.includes(r.status)){const td=Number.isInteger(c.body.translatorDeathYear)?c.body.translatorDeathYear:(b.rights?.translatorDeathYear??null);if(td!==null)r.translatorDeathYear=td;const e=checkTextRights(r,death,b.lazy?'':J(b.chapters),new Date().getFullYear(),{translated:!!b.translator,translatorDeath:td});if(e&&e!=='toolarge')return bad(422,e)}
  const before=b.rights?.status||'legacy';
  b.rights={...r,verifiedBy:c.user.id,verifiedAt:Date.now()};
  await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);await audit(c,'rights',id,{from:before,to:r.status,license:r.license,evidence:r.evidenceUrl});
  return json({ok:true});
},true);
/** Adds the full text to a metadata-only book, under the same rights check as an import. */
route('POST','/api/admin/books/:id/text',async(c,id)=>{
  const row=await get(c,'SELECT data FROM books WHERE id=?',id);if(!row)return bad(404);
  const b=P(row.data);if(b.lazy)return bad(409,'lazy_book');
  const text=String(c.body.text||''),r=cleanRights(c.body.rights),death=Number.isInteger(c.body.authorDeathYear)?c.body.authorDeathYear:null;
  if(death!==null)r.authorDeathYear=death;
  r.source={name:clip(c.body.sourceName,80)||b.rights?.source?.name||'',url:httpsUrl(c.body.sourceUrl)||b.rights?.source?.url||''};
  if(!r.source.name)return bad(422,'source');
  const td=Number.isInteger(c.body.translatorDeathYear)?c.body.translatorDeathYear:(b.rights?.translatorDeathYear??null);if(td!==null)r.translatorDeathYear=td;
  const e=checkTextRights(r,death,text,new Date().getFullYear(),{translated:!!b.translator,translatorDeath:td});if(e)return bad(e==='toolarge'?413:422,e);
  const chapters=parseManuscript(text);if(!chapters.length)return bad(400,'manuscript');
  await snapshotBook(c,id,b);
  b.chapters=chapters;b.pages=Math.max(1,Math.round(chapters.reduce((n,x)=>n+x.p.join('').length,0)/1800));b.rights={...r,verifiedBy:c.user.id,verifiedAt:Date.now()};b.updated=Date.now();
  await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);await audit(c,'text',id,{rights:r.status,chapters:chapters.length});
  return json({ok:true,chapters:chapters.length});
},true);
route('POST','/api/admin/demo',async c=>{
  const v=c.body.show===true||c.body.show===false?c.body.show:'auto';
  await run(c,"INSERT INTO meta(key,value) VALUES('showDemo',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",J(v));await audit(c,'demo',null,{show:v});return json({ok:true});
},true);
/* Permanently removes the test sample (books, authors, reviews, discussions) once real books exist. */
route('POST','/api/admin/demo/purge',async c=>{
  if(c.body.confirm!==true)return bad(400,'confirm');
  const real=(await get(c,`SELECT COUNT(*) n FROM books WHERE ${PUB_REAL}`)).n;
  if(real<1)return bad(409,'no_real_books');
  const D="(SELECT id FROM books WHERE json_extract(data,'$.demo')=1)",n=(await get(c,`SELECT COUNT(*) n FROM books WHERE id IN ${D}`)).n;
  const T=`(SELECT id FROM threads WHERE book_id IN ${D} OR demo=1)`;
  await batch(c,[
    stmt(c,`DELETE FROM comments WHERE thread_id IN ${T}`),stmt(c,`DELETE FROM threads WHERE id IN ${T}`),
    stmt(c,`DELETE FROM reviews WHERE book_id IN ${D} OR demo=1`),stmt(c,`DELETE FROM quotes WHERE book_id IN ${D} OR demo=1`),
    stmt(c,`DELETE FROM ratings WHERE book_id IN ${D}`),stmt(c,`DELETE FROM book_stats WHERE book_id IN ${D}`),stmt(c,`DELETE FROM book_seen WHERE book_id IN ${D}`),
    stmt(c,`DELETE FROM book_versions WHERE book_id IN ${D}`),stmt(c,`DELETE FROM audio_tracks WHERE book_id IN ${D}`),
    stmt(c,`DELETE FROM reading_progress WHERE book_id IN ${D}`),stmt(c,`DELETE FROM bookmarks WHERE book_id IN ${D}`),
    stmt(c,"DELETE FROM books WHERE json_extract(data,'$.demo')=1"),
    stmt(c,"DELETE FROM authors WHERE json_extract(data,'$.demo')=1 AND id NOT IN (SELECT json_extract(data,'$.a') FROM books WHERE json_extract(data,'$.a') IS NOT NULL)")]);
  await audit(c,'demo_purge',null,{books:n});return json({ok:true,deleted:n});
},true);
route('GET','/api/admin/demo',async c=>{const r=await get(c,"SELECT value FROM meta WHERE key='showDemo'");return json({show:r?P(r.value):'auto',visible:await demoVisible(c),
  counts:await get(c,"SELECT SUM(CASE WHEN json_extract(data,'$.demo')=1 THEN 1 ELSE 0 END) demo,SUM(CASE WHEN json_extract(data,'$.demo') IS NOT 1 THEN 1 ELSE 0 END) real FROM books")})},true);
/* Audio: the player needs real files. Tracks are links to audio the admin is entitled to distribute (https only); the same rights rule as text applies. */
route('GET','/api/books/:id/audio',async(c,id)=>{
  const row=await get(c,'SELECT data,hidden FROM books WHERE id=?',id);if(!row||(row.hidden&&!c.user.admin))return bad(404);
  if(!canRead(P(row.data))&&!c.user.admin)return bad(403,'rights');
  return json({tracks:(await all(c,'SELECT id,idx,title,url,duration FROM audio_tracks WHERE book_id=? ORDER BY idx,id',id))});
});
route('POST','/api/admin/books/:id/audio',async(c,id)=>{
  const row=await get(c,'SELECT data FROM books WHERE id=?',id);if(!row)return bad(404);
  if(!canRead(P(row.data)))return bad(422,'rights_required');
  const list=(Array.isArray(c.body.tracks)?c.body.tracks:[]).slice(0,200).map((t,i)=>({title:clip(t.title,120)||`Часть ${i+1}`,url:httpsUrl(t.url),duration:Math.max(0,Math.min(86400,Math.round(+t.duration)||0))}));
  if(list.some(t=>!t.url))return bad(422,'url');
  await batch(c,[stmt(c,'DELETE FROM audio_tracks WHERE book_id=?',id),...list.map((t,i)=>stmt(c,'INSERT INTO audio_tracks(book_id,idx,title,url,duration,created) VALUES(?,?,?,?,?,?)',id,i,t.title,t.url,t.duration,Date.now()))]);
  await audit(c,'audio',id,{tracks:list.length});return json({ok:true,tracks:list.length});
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

/* ---------- donations (Telegram Stars) ---------- */
const DEFAULT_DONATE={presets:[25,50,100,250],links:[],patronMin:50,
  intro:{ru:'Muloqot Books независим и растёт благодаря читателям. Ваша поддержка идёт на новые книги, переводы, авторам и развитие приложения.',uz:'Muloqot Books mustaqil va o‘quvchilar hisobiga rivojlanadi. Yordamingiz yangi kitoblar, tarjimalar, mualliflar va ilova rivojiga ketadi.'},
  thanks:{ru:'Спасибо за поддержку! Вы помогаете Muloqot Books расти 💛',uz:'Yordamingiz uchun rahmat! Siz Muloqot Books rivojiga hissa qo‘shyapsiz 💛'}};
const getDonateSettings=async c=>{const r=await get(c,"SELECT value FROM meta WHERE key='donate'");return {...DEFAULT_DONATE,...(r?P(r.value):{})}};
const goalRows=async(c,onlyActive=true)=>{
  const gs=await all(c,`SELECT * FROM goals ${onlyActive?'WHERE active=1':''} ORDER BY created`);
  const sums=await all(c,"SELECT goal_id,SUM(amount) s FROM donations WHERE status='paid' AND goal_id IS NOT NULL GROUP BY goal_id");
  return gs.map(g=>({id:g.id,title:{ru:g.title_ru,uz:g.title_uz||g.title_ru},desc:{ru:g.desc_ru||'',uz:g.desc_uz||g.desc_ru||''},target:g.target,active:!!g.active,raised:sums.find(x=>x.goal_id===g.id)?.s||0}));
};
route('GET','/api/donate',async c=>{
  const st=await getDonateSettings(c);
  const [top,recent,mine]=await batch(c,[
    stmt(c,"SELECT COALESCE(user_name,'') name,SUM(amount) total FROM donations WHERE status='paid' AND anon=0 GROUP BY COALESCE(user_id,id) ORDER BY total DESC LIMIT 10"),
    stmt(c,"SELECT user_name,amount,message,paid_at,goal_id FROM donations WHERE status='paid' AND anon=0 AND message<>'' ORDER BY paid_at DESC LIMIT 8"),
    stmt(c,"SELECT COALESCE(SUM(amount),0) s FROM donations WHERE status='paid' AND user_id=?",c.user.id)]);
  const total=(await get(c,"SELECT COALESCE(SUM(amount),0) s,COUNT(*) n FROM donations WHERE status='paid'"));
  return json({settings:{presets:st.presets,links:st.links,intro:st.intro,thanks:st.thanks,patronMin:st.patronMin},goals:await goalRows(c),
    top:top.filter(x=>x.name),recent:recent.map(r=>({name:r.user_name,amount:r.amount,message:r.message,at:r.paid_at})),
    mine:mine[0].s,total:total.s,count:total.n,stars:!!c.env.BOT_TOKEN});
});
route('POST','/api/donate/invoice',async c=>{
  if(!c.env.BOT_TOKEN)return bad(400,'payments unavailable');
  const amount=Math.floor(+c.body.amount);if(!(amount>=1&&amount<=100000))return bad(400,'amount');
  const goal=c.body.goalId?await get(c,'SELECT id,title_ru FROM goals WHERE id=? AND active=1',c.body.goalId):null;
  const id='d'+id8(),message=clip(c.body.message,200);
  await run(c,"INSERT INTO donations(id,user_id,user_name,amount,source,goal_id,anon,message,status,created) VALUES(?,?,?,?,'stars',?,?,?,'pending',?)",id,c.user.id,c.user.name,amount,goal?.id||null,c.body.anon?1:0,message,Date.now());
  const r=await tgJson(c.env,'createInvoiceLink',{title:'Поддержка Muloqot Books',description:goal?`Цель: ${goal.title_ru}`.slice(0,250):'Развитие платформы и новые книги',payload:id,currency:'XTR',prices:[{label:'Поддержка',amount}]});
  if(!r?.ok){await run(c,"UPDATE donations SET status='failed' WHERE id=?",id);return bad(502,r?.description||'telegram error')}
  return json({link:r.result,id});
});
const thanksText=async(c,name)=>{const s=await getDonateSettings(c);return s.thanks.ru};
/** Called from the bot webhook after Telegram confirms payment. Idempotent on the charge id. */
async function onPaid(c,sp,fromId){
  const id=sp.invoice_payload,d=await get(c,'SELECT * FROM donations WHERE id=?',id);if(!d||d.status==='paid')return;
  await run(c,"UPDATE donations SET status='paid',charge_id=?,paid_at=? WHERE id=?",sp.telegram_payment_charge_id,Date.now(),id);
  notify(c,d.user_id,await thanksText(c));
  await notifyAdmins(c,'donations',`Новый донат: ${d.amount} Stars от ${d.anon?'анонима':d.user_name}${d.message?` — «${d.message}»`:''}`);
}

/* ---------- admin: donations ---------- */
route('GET','/api/admin/donations',async c=>{
  const D=864e5,now=Date.now();
  const [sum,m30,donors,list]=await batch(c,[
    stmt(c,"SELECT COALESCE(SUM(amount),0) s,COUNT(*) n FROM donations WHERE status='paid'"),
    stmt(c,"SELECT COALESCE(SUM(amount),0) s FROM donations WHERE status='paid' AND paid_at>?",now-30*D),
    stmt(c,"SELECT COUNT(DISTINCT COALESCE(user_id,id)) n FROM donations WHERE status='paid'"),
    stmt(c,"SELECT id,user_id,user_name,amount,source,goal_id,anon,message,status,note,created,paid_at FROM donations WHERE status IN ('paid','refunded') ORDER BY COALESCE(paid_at,created) DESC LIMIT 40")]);
  let balance=null,hook=null;
  if(c.env.BOT_TOKEN){const [b,h]=await Promise.all([tgJson(c.env,'getMyStarBalance',{}),tgJson(c.env,'getWebhookInfo',{})]);
    if(b?.ok)balance=b.result.amount;if(h?.ok)hook={url:h.result.url,pending:h.result.pending_update_count,error:h.result.last_error_message||''}}
  const st=await getDonateSettings(c);
  return json({total:sum[0].s,count:sum[0].n,last30:m30[0].s,donors:donors[0].n,list:list,goals:await goalRows(c,false),settings:st,balance,hook,bot:!!c.env.BOT_TOKEN});
},true);
route('POST','/api/admin/webhook/setup',async c=>{
  if(!c.env.BOT_TOKEN)return bad(400,'no bot token');
  const url=new URL(c.request.url).origin+'/telegram/webhook';
  const r=await tgJson(c.env,'setWebhook',{url,secret_token:await webhookSecret(c.env),allowed_updates:['message','pre_checkout_query','callback_query','inline_query'],drop_pending_updates:false});
  const bot=await setupBot(c.env);
  return json({ok:!!r?.ok,description:r?.description||'',url,bot});
},true);
route('POST','/api/admin/donations/:id/refund',async(c,id)=>{
  const d=await get(c,"SELECT * FROM donations WHERE id=? AND status='paid' AND source='stars'",id);if(!d||!d.charge_id)return bad(404);
  const r=await tgJson(c.env,'refundStarPayment',{user_id:+d.user_id,telegram_payment_charge_id:d.charge_id});
  if(!r?.ok)return bad(502,r?.description||'refund failed');
  await run(c,"UPDATE donations SET status='refunded' WHERE id=?",id);return json({ok:true});
},true);
route('POST','/api/admin/donations/manual',async c=>{
  const amount=Math.floor(+c.body.amount);if(!(amount>=1))return bad();
  const goal=c.body.goalId&&await get(c,'SELECT id FROM goals WHERE id=?',c.body.goalId)?c.body.goalId:null;
  await run(c,"INSERT INTO donations(id,user_id,user_name,amount,source,goal_id,anon,message,status,note,created,paid_at) VALUES(?,?,?,?,'manual',?,?,?,'paid',?,?,?)",'d'+id8(),null,clip(c.body.name,60)||'Поддержка',amount,goal,c.body.anon?1:0,'',clip(c.body.note,200),Date.now(),Date.now());
  return json({ok:true});
},true);
route('POST','/api/admin/goals',async c=>{
  const b=c.body,tr_=clip(b.titleRu,80),target=Math.floor(+b.target);if(!tr_||!(target>=1))return bad();
  const vals=[tr_,clip(b.titleUz,80)||tr_,clip(b.descRu,400),clip(b.descUz,400)||clip(b.descRu,400),target,b.active===false?0:1];
  if(b.id&&await get(c,'SELECT 1 x FROM goals WHERE id=?',b.id))await run(c,'UPDATE goals SET title_ru=?,title_uz=?,desc_ru=?,desc_uz=?,target=?,active=? WHERE id=?',...vals,b.id);
  else await run(c,'INSERT INTO goals(title_ru,title_uz,desc_ru,desc_uz,target,active,id,created) VALUES(?,?,?,?,?,?,?,?)',...vals,'g'+id8(),Date.now());
  return json({ok:true});
},true);
route('POST','/api/admin/goals/:id/delete',async(c,id)=>{await run(c,'DELETE FROM goals WHERE id=?',id);await run(c,'UPDATE donations SET goal_id=NULL WHERE goal_id=?',id);return json({ok:true})},true);
route('GET','/api/admin/welcome',async c=>{
  const al=await get(c,"SELECT value FROM meta WHERE key='applink'");
  return json({text:await getWelcome(c,'ru'),textUz:await getWelcome(c,'uz'),appLink:al?P(al.value):''});
},true);
route('POST','/api/admin/welcome',async c=>{
  const save=async(key,val)=>{if(val)await run(c,"INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",key,J(key==='applink'?val:{text:val}));else await run(c,'DELETE FROM meta WHERE key=?',key)};
  if(c.body.text!==undefined)await save('welcome',clip(c.body.text,3500));
  if(c.body.textUz!==undefined)await save('welcomeUz',clip(c.body.textUz,3500));
  let appLink;
  if(c.body.appLink!==undefined){
    /* forgive small slips: missing https://, a trailing slash, ?startapp=… parameters */
    let link=clip(c.body.appLink,200).replace(/[?#].*$/,'').replace(/\/+$/,'');
    if(/^(www\.)?t\.me\//i.test(link))link='https://'+link.replace(/^www\./i,'');
    if(link&&!/^https:\/\/t\.me\/[\w]+(\/[\w]+)?$/i.test(link))return bad(400,'badlink');
    await save('applink',link);appLink=link;
  }
  return json({ok:true,appLink});
},true);
route('GET','/api/admin/notif-settings',async c=>json(await getAdminNotif(c)),true);
route('POST','/api/admin/notif-settings',async c=>{
  const cur=await getAdminNotif(c);
  for(const k of Object.keys(ADMIN_NOTIF_DEFAULT))if(['off','silent','on'].includes(c.body[k]))cur[k]=c.body[k];
  await run(c,"INSERT INTO meta VALUES('adminNotif',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",J(cur));return json(cur);
},true);
route('POST','/api/admin/donate-settings',async c=>{
  const b=c.body,cur=await getDonateSettings(c);
  const presets=(Array.isArray(b.presets)?b.presets:[]).map(n=>Math.floor(+n)).filter(n=>n>=1&&n<=100000).slice(0,6);
  const links=(Array.isArray(b.links)?b.links:[]).map(l=>({title:clip(l.title,40),url:clip(l.url,300)})).filter(l=>l.title&&/^https:\/\//.test(l.url)).slice(0,6);
  const next={presets:presets.length?presets:cur.presets,links,patronMin:Math.max(1,Math.floor(+b.patronMin)||cur.patronMin),
    intro:{ru:clip(b.introRu,600)||cur.intro.ru,uz:clip(b.introUz,600)||clip(b.introRu,600)||cur.intro.uz},thanks:{ru:clip(b.thanksRu,300)||cur.thanks.ru,uz:clip(b.thanksUz,300)||clip(b.thanksRu,300)||cur.thanks.uz}};
  await run(c,"INSERT INTO meta VALUES('donate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",J(next));return json({ok:true});
},true);

/* ---------- author stats & book events ---------- */
route('POST','/api/books/:id/event',async(c,id)=>{
  const col={view:'views',read:'reads',finish:'finishes'}[c.body.type];
  if(!col||!await pubBook(c,id))return bad();
  const day=new Date().toISOString().slice(0,10);
  const r=await run(c,'INSERT OR IGNORE INTO book_seen(user_id,book_id,day,type) VALUES(?,?,?,?)',c.user.id,id,day,c.body.type);
  if(r.meta.changes)await run(c,`INSERT INTO book_stats(book_id,day,${col}) VALUES(?,?,1) ON CONFLICT(book_id,day) DO UPDATE SET ${col}=${col}+1`,id,day);
  if(Math.random()<0.02)await run(c,'DELETE FROM book_seen WHERE day<?',new Date(Date.now()-60*864e5).toISOString().slice(0,10));
  return json({ok:true});
});
const OWN="FROM books b JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE a.user_id=?";
route('GET','/api/author/stats',async c=>{
  const since=new Date(Date.now()-13*864e5).toISOString().slice(0,10);
  const [books,tot,series,rev]=await batch(c,[
    stmt(c,`SELECT b.id,b.data,b.hidden ${OWN} ORDER BY b.added DESC`,c.user.id),
    stmt(c,`SELECT s.book_id,SUM(s.views) v,SUM(s.reads) r,SUM(s.finishes) f FROM book_stats s JOIN books b ON b.id=s.book_id JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE a.user_id=? GROUP BY s.book_id`,c.user.id),
    stmt(c,`SELECT s.day,SUM(s.views) v,SUM(s.reads) r FROM book_stats s JOIN books b ON b.id=s.book_id JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE a.user_id=? AND s.day>=? GROUP BY s.day ORDER BY s.day`,c.user.id,since),
    stmt(c,`SELECT r.book_id,COUNT(*) n FROM reviews r JOIN books b ON b.id=r.book_id JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE a.user_id=? GROUP BY r.book_id`,c.user.id)]);
  const agg=await ratingAgg(c);
  const pend=new Set((await all(c,"SELECT update_book_id FROM submissions WHERE user_id=? AND status='moderation' AND update_book_id IS NOT NULL",c.user.id)).map(x=>x.update_book_id));
  return json({books:books.map(r=>{const b=bookOut(r,agg),t=tot.find(x=>x.book_id===r.id)||{},v=rev.find(x=>x.book_id===r.id);
    return{pending:pend.has(r.id),id:r.id,title:b.title,rating:b.rating,count:b.count,hidden:!!r.hidden,chapters:b.chapters.length,views:t.v||0,reads:t.r||0,finishes:t.f||0,reviews:v?.n||0}}),series});
});
route('POST','/api/author/books/:id/edit',async(c,id)=>{
  const row=await get(c,`SELECT b.data ${OWN} AND b.id=?`,c.user.id,id);if(!row)return bad(404);
  const b=P(row.data),title=clip(c.body.title,120),desc=clip(c.body.desc,3000);if(title.length<2||desc.length<20)return bad();
  b.title=title;b.desc=desc;await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);return json({ok:true});
});

route('POST','/api/author/books/:id/update',async(c,id)=>{
  const row=await get(c,`SELECT b.data ${OWN} AND b.id=?`,c.user.id,id);if(!row)return bad(404);
  const body=String(c.body.body||'').slice(0,1_200_000);if(body.trim().length<500)return bad(400,'manuscript');
  if(await get(c,"SELECT 1 x FROM submissions WHERE update_book_id=? AND status='moderation'",id))return bad(409,'pending');
  const b=P(row.data),sid='s'+id8();
  await run(c,"INSERT INTO submissions(id,user_id,title,author_name,lang,genre,description,tags,cover,file_name,body,status,note,book_id,created,update_book_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,'moderation','',?,?,?)",sid,c.user.id,b.title,c.user.name,b.lang,b.genre,clip(c.body.note,500),'',null,clip(c.body.fileName,120),body,id,Date.now(),id);
  await notifyAdmins(c,'submissions',`Обновление текста книги «${b.title}» ждёт проверки`);
  return json({ok:true});
});
/* ---------- achievements (computed from facts, unlocks are remembered) ---------- */
const ACH=[
  ['r_open','reader','lib',1,'opened','Первая страница','Birinchi sahifa','Откройте любую книгу','Istalgan kitobni oching'],
  ['r_fin1','reader','check',1,'finished','Дочитано','Tugatildi','Дочитайте первую книгу до конца','Birinchi kitobni oxirigacha o‘qing'],
  ['r_fin3','reader','check',3,'finished','Книголюб','Kitobsevar','Дочитайте 3 книги','3 ta kitobni tugating'],
  ['r_fin10','reader','check',10,'finished','Библиофил','Bibliofil','Дочитайте 10 книг','10 ta kitobni tugating'],
  ['r_str3','reader','flame',3,'streak','Три дня подряд','Ketma-ket 3 kun','Читайте 3 дня подряд','3 kun ketma-ket o‘qing'],
  ['r_str7','reader','flame',7,'streak','Неделя чтения','O‘qish haftasi','Читайте 7 дней подряд','7 kun ketma-ket o‘qing'],
  ['r_str30','reader','flame',30,'streak','Месяц с книгой','Kitob bilan bir oy','Читайте 30 дней подряд','30 kun ketma-ket o‘qing'],
  ['r_rev1','reader','star',1,'reviews','Первый отзыв','Birinchi sharh','Напишите отзыв о книге','Kitob haqida sharh yozing'],
  ['r_rev5','reader','star',5,'reviews','Критик','Tanqidchi','Напишите 5 отзывов','5 ta sharh yozing'],
  ['r_save5','reader','bookmark',5,'saved','Своя полка','O‘z javonim','Сохраните 5 книг в библиотеку','Kutubxonaga 5 ta kitob saqlang'],
  ['r_quote3','reader','quote',3,'quotes','Любитель цитат','Iqtiboslar sevuvchi','Сохраните 3 цитаты','3 ta iqtibos saqlang'],
  ['r_lang','reader','globe',2,'langs','Два языка','Ikki til','Дочитайте книги на русском и узбекском','Rus va o‘zbek tilidagi kitoblarni tugating'],
  ['r_talk','reader','chat',3,'talk','В разговоре','Suhbatda','Напишите 3 комментария или темы','3 ta izoh yoki mavzu yozing'],
  ['r_follow','reader','user',3,'follows','Подписчик','Obunachi','Подпишитесь на 3 авторов','3 ta muallifga obuna bo‘ling'],
  ['r_patron','reader','heart',1,'patron','Меценат','Homiy','Поддержите проект','Loyihani qo‘llab-quvvatlang'],
  ['a_debut','author','pen',1,'books','Дебют','Debyut','Опубликуйте первую книгу','Birinchi kitobingizni nashr eting'],
  ['a_writer','author','pen',3,'books','Писатель','Yozuvchi','Опубликуйте 3 книги','3 ta kitob nashr eting'],
  ['a_v100','author','spark',100,'views','Сотня просмотров','100 ko‘rish','Наберите 100 просмотров','100 ta ko‘rish to‘plang'],
  ['a_v1000','author','spark',1000,'views','Тысяча просмотров','1000 ko‘rish','Наберите 1000 просмотров','1000 ta ko‘rish to‘plang'],
  ['a_read10','author','clock',10,'reads','Первые читатели','Birinchi o‘quvchilar','10 человек начали читать ваши книги','10 kishi kitoblaringizni o‘qiy boshladi'],
  ['a_fin10','author','check',10,'finishes','Дочитали до конца','Oxirigacha o‘qidi','10 человек дочитали ваши книги','10 kishi kitoblaringizni tugatdi'],
  ['a_loved','author','star',5,'loved','Любимец читателей','O‘quvchilar sevimlisi','Получите 5 оценок со средним не ниже 4,5','O‘rtacha 4,5 dan past bo‘lmagan 5 ta baho oling'],
  ['a_rev10','author','chat',10,'ownreviews','Вас услышали','Siz eshitildingiz','10 отзывов на ваши книги','Kitoblaringizga 10 ta sharh'],
  ['a_update','author','pen',1,'updates','Работа над ошибками','Xatolar ustida ishlash','Обновите текст опубликованной книги','Nashr etilgan kitob matnini yangilang']
];
const bestStreak=days=>{const d=[...new Set(days||[])].sort();let best=0,run=0,prev=null;for(const x of d){const t=Date.parse(x+'T00:00:00Z');run=prev!==null&&t-prev===864e5?run+1:1;prev=t;if(run>best)best=run}return best};
async function achFacts(c,uid){
  const demoOn=await demoVisible(c);
  const own="FROM books b JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE a.user_id=?1";
  const [u,rv,th,cm,don,fol,bk,my,st,rt,orv,up,rp]=await batch(c,[
    stmt(c,'SELECT state FROM users WHERE id=?',uid),stmt(c,'SELECT COUNT(*) n FROM reviews WHERE user_id=?',uid),stmt(c,'SELECT COUNT(*) n FROM threads WHERE user_id=?',uid),stmt(c,'SELECT COUNT(*) n FROM comments WHERE user_id=?',uid),
    stmt(c,"SELECT COALESCE(SUM(amount),0) s FROM donations WHERE status='paid' AND user_id=?",uid),stmt(c,'SELECT COUNT(*) n FROM follows WHERE user_id=?',uid),
    stmt(c,`SELECT id,json_extract(data,'$.lang') l FROM books WHERE json_extract(data,'$.publish') IS NOT 'draft'${demoOn?'':" AND json_extract(data,'$.demo') IS NOT 1"}`),
    stmt(c,`SELECT COUNT(*) n ${own}`,uid),
    stmt(c,"SELECT COALESCE(SUM(s.views),0) v,COALESCE(SUM(s.reads),0) r,COALESCE(SUM(s.finishes),0) f FROM book_stats s JOIN books b ON b.id=s.book_id JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE a.user_id=?",uid),
    stmt(c,"SELECT COUNT(*) n,COALESCE(AVG(r.value),0) avg FROM ratings r JOIN books b ON b.id=r.book_id JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE a.user_id=?",uid),
    stmt(c,"SELECT COUNT(*) n FROM reviews r JOIN books b ON b.id=r.book_id JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE a.user_id=?",uid),
    stmt(c,"SELECT COUNT(*) n FROM submissions WHERE user_id=? AND status='approved' AND update_book_id IS NOT NULL",uid),
    stmt(c,'SELECT book_id FROM reading_progress WHERE user_id=?',uid)]);
  const state=P(u[0]?.state||'{}'),lang=Object.fromEntries(bk.map(b=>[b.id,b.l]));
  /* only books that exist (and are visible) count: ids left over from removed or hidden test books must not unlock achievements */
  const fin=(state.finished||[]).filter(id=>id in lang);
  const ratings=rt[0];
  return{opened:new Set([...Object.keys(state.progress||{}),...rp.map(r=>r.book_id)].filter(id=>id in lang)).size,finished:fin.length,streak:bestStreak(state.days),reviews:rv[0].n,saved:(state.saved||[]).filter(id=>id in lang).length,quotes:(state.myQuotes||[]).length,
    langs:new Set(fin.map(id=>lang[id]).filter(Boolean)).size,talk:th[0].n+cm[0].n,follows:fol[0].n,patron:don[0].s>0?1:0,
    books:my[0].n,views:st[0].v,reads:st[0].r,finishes:st[0].f,loved:ratings.avg>=4.5?ratings.n:Math.min(ratings.n,4),ownreviews:orv[0].n,updates:up[0].n};
}
const achOut=(d,facts,row,isNew)=>({id:d[0],group:d[1],icon:d[2],target:d[3],current:Math.min(facts[d[4]]||0,d[3]),unlocked:(facts[d[4]]||0)>=d[3],ts:row?.ts||null,isNew:!!isNew,title:{ru:d[5],uz:d[6]},desc:{ru:d[7],uz:d[8]}});
/* mode=check returns only newly unlocked achievements (for the toast); the default returns the full list for the screen. */
route('GET','/api/achievements',async c=>{
  const check=new URL(c.request.url).searchParams.get('mode')==='check',uid=c.user.id;
  const facts=await achFacts(c,uid),have=new Map((await all(c,'SELECT key,ts,seen FROM achievements WHERE user_id=?',uid)).map(r=>[r.key,r])),now=Date.now(),list=[];
  for(const d of ACH){
    const got=(facts[d[4]]||0)>=d[3];let row=have.get(d[0]);
    if(got&&!row){await run(c,'INSERT OR IGNORE INTO achievements(user_id,key,ts,seen) VALUES(?,?,?,0)',uid,d[0],now);row={ts:now,seen:0}}
    list.push(achOut(d,facts,row,row&&!row.seen));
  }
  await run(c,'UPDATE achievements SET seen=1 WHERE user_id=? AND seen=0',uid);
  return json(check?{fresh:list.filter(a=>a.isNew)}:{list,total:list.length,unlocked:list.filter(a=>a.unlocked).length});
});

/* ---------- inline search (@bot query in any chat) ---------- */
const fold=t=>String(t||'').toLowerCase().replace(/[ʻʼ‘’`']/g,'').replace(/ё/g,'е');
const hesc=t=>String(t||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
const BOOK_ROW_SQL="SELECT b.id,json_extract(b.data,'$.title') t,json_extract(b.data,'$.desc') d,json_extract(b.data,'$.demo') demo,json_extract(b.data,'$.rating') r,json_extract(b.data,'$.count') n,(SELECT COUNT(*) FROM ratings WHERE book_id=b.id) rn,(SELECT AVG(value) FROM ratings WHERE book_id=b.id) ra,json_extract(b.data,'$.img') IS NOT NULL img,substr(json_extract(b.data,'$.img'),1,16)='data:image/jpeg;' jpeg,json_extract(b.data,'$.genre') g,json_extract(b.data,'$.year') y,json_extract(b.data,'$.lang') lg,json_extract(b.data,'$.pages') pg,json_extract(b.data,'$.series') se,json_extract(b.data,'$.seriesNo') sn,json_extract(a.data,'$.name') an FROM books b LEFT JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE (b.hidden=0 OR b.hidden IS NULL) AND json_extract(b.data,'$.publish') IS NOT 'draft'";
const GENRE_NAME={novel:['Роман','Roman'],detective:['Детектив','Detektiv'],historical:['Историческая проза','Tarixiy nasr'],adventure:['Приключения','Sarguzasht'],drama:['Драма','Drama'],stories:['Рассказы','Hikoyalar'],modern:['Современная проза','Zamonaviy nasr'],prose:['Проза','Nasr'],poetry:['Поэзия','She’riyat'],publicism:['Публицистика','Publitsistika']};
/** Real rating only (demo books keep their sample numbers); null when nobody has rated the book yet. */
const cardRating=b=>b.demo?(b.n>0?{v:Math.round(b.r*10)/10,n:b.n}:null):(b.rn>0?{v:Math.round(b.ra*10)/10,n:b.rn}:null);
const clipWords=(t,n)=>{t=String(t||'').replace(/\s+/g,' ').trim();if(t.length<=n)return t;const cut=t.slice(0,n),sp=cut.lastIndexOf(' ');return (sp>n*.6?cut.slice(0,sp):cut).replace(/[\s,;:.\-—]+$/,'')+'…'};
/** One book as a Telegram inline result, used by inline search and by the prepared "share" card.
    With a JPEG cover it is a photo with a caption; otherwise a formatted text card. */
function bookCard(b,{base,link,lang}){
  const uz=lang==='uz',gi=uz?1:0,rt=cardRating(b),genre=(GENRE_NAME[b.g]||[])[gi]||'';
  const meta=[genre,String(b.lg||'').toUpperCase(),b.pg>=3?`≈${Math.round(b.pg*1.5)} ${uz?'daq':'мин'}`:''].filter(Boolean).join(' · ');
  const byline=`${b.an?`<i>${hesc(b.an)}</i>`:''}${b.y?`${b.an?'  ·  ':''}${b.y}`:''}`;
  const lines=[`📖 <b>${hesc(b.t)}</b>`,byline,b.se?`${uz?'Seriya':'Серия'}: ${hesc(b.se)}${b.sn?` · №${b.sn}`:''}`:''].filter(Boolean);
  let text=lines.join('\n');
  const desc=clipWords(b.d,300);if(desc)text+=`\n\n<blockquote>${hesc(desc)}</blockquote>`;
  text+=`\n\n${meta?`🏷 ${hesc(meta)}`:''}${rt?`${meta?'\n':''}⭐ ${rt.v} · ${rt.n} ${uz?'baho':'оценок'}`:''}`;
  text=text.trim();
  const reply={...(link?{reply_markup:{inline_keyboard:[[{text:uz?'📖 Muloqot Books’da o‘qish':'📖 Читать в Muloqot Books',url:`${link}?startapp=book_${b.id}`}]]}}:{})};
  const listLine=[b.an,genre,b.y,rt?`⭐ ${rt.v}`:''].filter(Boolean).join(' · ');
  /* A book with a JPEG cover goes out as a photo card (cover on top, text under it); Telegram does not draw link previews for bot-prepared messages reliably. */
  if(b.jpeg&&base)return{type:'photo',id:b.id,photo_url:`${base}/api/cover/${b.id}`,thumbnail_url:`${base}/api/cover/${b.id}`,photo_width:300,photo_height:450,title:b.t,description:listLine,caption:text.slice(0,1000),parse_mode:'HTML',...reply};
  return{type:'article',id:b.id,title:b.t,description:listLine,
    ...(b.img&&base?{thumbnail_url:`${base}/api/cover/${b.id}`,thumbnail_width:200,thumbnail_height:300}:{}),
    input_message_content:{message_text:text,parse_mode:'HTML',link_preview_options:{is_disabled:true}},...reply};
}
const getAppLink=async c=>{const al=await get(c,"SELECT value FROM meta WHERE key='applink'");return al?P(al.value):''};
async function onInline(c,q){
  const env=c.env,qs=fold(q.query).trim(),base=baseUrl(env),lang=(q.from?.language_code||'').startsWith('uz')?'uz':'ru';
  const rows=await all(c,BOOK_ROW_SQL+' LIMIT 500'),link=await getAppLink(c);
  const list=(qs?rows.filter(b=>fold(b.t+' '+b.an).includes(qs)):rows.slice().sort((x,y)=>(y.n||0)-(x.n||0))).slice(0,10);
  await tgApi(env,'answerInlineQuery',{inline_query_id:q.id,results:list.map(b=>bookCard(b,{base,link,lang})),cache_time:30,is_personal:false,...(base?{button:{text:'📚 Открыть Muloqot Books',web_app:{url:base}}}:{})});
}
/* "Share" from the app: the bot prepares a rich card and the Mini App hands it to Telegram's chat picker (Telegram.WebApp.shareMessage). */
route('POST','/api/books/:id/prepared',async(c,id)=>{
  if(!c.env.BOT_TOKEN||!/^\d+$/.test(c.user.id))return bad(400,'unavailable');
  const row=await get(c,BOOK_ROW_SQL+' AND b.id=?',id);if(!row)return bad(404);
  const r=await tgJson(c.env,'savePreparedInlineMessage',{user_id:+c.user.id,result:bookCard(row,{base:baseUrl(c.env),link:await getAppLink(c),lang:c.body.lang==='uz'?'uz':'ru'}),allow_user_chats:true,allow_group_chats:true,allow_channel_chats:true,allow_bot_chats:false});
  if(!r?.ok||!r.result?.id)return bad(502,r?.description||'telegram error');
  return json({id:r.result.id});
});

/* ---------- book versions (kept so an approved replacement can be rolled back) ---------- */
async function snapshotBook(c,bookId,book){
  if(book.lazy)return;
  await run(c,'INSERT INTO book_versions(book_id,created,data) VALUES(?,?,?)',bookId,Date.now(),J({chapters:book.chapters,pages:book.pages}));
  await run(c,'DELETE FROM book_versions WHERE book_id=?1 AND id NOT IN (SELECT id FROM book_versions WHERE book_id=?1 ORDER BY id DESC LIMIT 5)',bookId);
}
route('GET','/api/admin/books/:id/versions',async(c,id)=>json({list:(await all(c,'SELECT id,created,data FROM book_versions WHERE book_id=? ORDER BY id DESC',id)).map(v=>{const d=P(v.data);return{id:v.id,created:v.created,chapters:d.chapters.length,chars:d.chapters.reduce((n,x)=>n+x.p.join('').length,0)}})}),true);
route('POST','/api/admin/books/:id/restore',async(c,id)=>{
  const v=await get(c,'SELECT data FROM book_versions WHERE id=? AND book_id=?',c.body.versionId,id),row=await get(c,'SELECT data FROM books WHERE id=?',id);
  if(!v||!row)return bad(404);
  const book=P(row.data),old=P(v.data);
  await snapshotBook(c,id,book);
  book.chapters=old.chapters;book.pages=old.pages;book.updated=Date.now();
  await run(c,'UPDATE books SET data=? WHERE id=?',J(book),id);return json({ok:true});
},true);

/* ---------- reports ---------- */
const REPORT_KINDS={review:['reviews','text'],thread:['threads','title'],comment:['comments','text']};
route('POST','/api/reports',async c=>{
  const kind=c.body.kind,k=REPORT_KINDS[kind],target=String(c.body.targetId||'');
  if(!k||!target)return bad();
  const row=await get(c,`SELECT user_id,${k[1]} txt FROM ${k[0]} WHERE id=?`,target);if(!row)return bad(404);
  if(row.user_id===c.user.id)return bad(400,'own');
  const reason=['spam','abuse','inappropriate','other'].includes(c.body.reason)?c.body.reason:'other';
  const ins=await run(c,'INSERT OR IGNORE INTO reports(kind,target,user_id,reason,created) VALUES(?,?,?,?,?)',kind,target,c.user.id,reason,Date.now());
  const n=(await get(c,"SELECT COUNT(*) n FROM reports WHERE kind=? AND target=? AND status='open'",kind,target)).n;
  if(ins.meta.changes&&n===1)await notifyAdmins(c,'reports',`Новая жалоба (${{review:'отзыв',thread:'тема',comment:'комментарий'}[kind]}): «${clip(row.txt,120)}». Админ-панель → Жалобы.`);
  if(n>=3)await run(c,`UPDATE ${k[0]} SET hidden=1 WHERE id=?`,target);
  return json({ok:true});
});
route('GET','/api/admin/reports',async c=>{
  const rs=await all(c,"SELECT kind,target,reason,COUNT(*) n FROM reports WHERE status='open' GROUP BY kind,target,reason ORDER BY MAX(created) DESC LIMIT 60");
  const groups=new Map();rs.forEach(r=>{const key=r.kind+':'+r.target;const g=groups.get(key)||{kind:r.kind,target:r.target,count:0,reasons:{}};g.count+=r.n;g.reasons[r.reason]=r.n;groups.set(key,g)});
  const out=[];
  for(const g of [...groups.values()].slice(0,40)){const k=REPORT_KINDS[g.kind];
    const row=await get(c,`SELECT user_id,user_name,${k[1]} txt,hidden FROM ${k[0]} WHERE id=?`,g.target);
    out.push({...g,text:row?.txt||'',author:row?.user_name||'',authorId:row?.user_id||'',hidden:!!row?.hidden,gone:!row})}
  return json({list:out,stopwords:await getStopwords(c)});
},true);
route('POST','/api/admin/reports/resolve',async c=>{
  const {kind,target,action}=c.body,k=REPORT_KINDS[kind];if(!k)return bad();
  const row=await get(c,`SELECT user_id FROM ${k[0]} WHERE id=?`,target);
  if(action==='delete'||action==='ban'){
    if(kind==='review')await batch(c,[stmt(c,'DELETE FROM reviews WHERE id=?',target),stmt(c,'DELETE FROM review_replies WHERE review_id=?',target)]);
    else if(kind==='thread')await batch(c,[stmt(c,'DELETE FROM threads WHERE id=?',target),stmt(c,'DELETE FROM comments WHERE thread_id=?',target)]);
    else await run(c,'DELETE FROM comments WHERE id=? OR parent_id=?',target,target);
    if(action==='ban'&&row?.user_id&&!csv(c.env.ADMIN_IDS).includes(row.user_id))await run(c,'UPDATE users SET banned=1 WHERE id=?',row.user_id);
  }else await run(c,`UPDATE ${k[0]} SET hidden=0 WHERE id=?`,target);
  await run(c,"UPDATE reports SET status='resolved' WHERE kind=? AND target=?",kind,target);
  return json({ok:true});
},true);
route('POST','/api/admin/stopwords',async c=>{
  const list=[...new Set((Array.isArray(c.body.list)?c.body.list:[]).map(w=>clip(w,40).toLowerCase()).filter(Boolean))].slice(0,200);
  await run(c,"INSERT INTO meta VALUES('stopwords',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",J(list));return json({ok:true});
},true);

/* ---------- entry points ---------- */
/** Machine import: Authorization: Bearer IMPORT_TOKEN. Disabled (503) unless the secret is configured; no user session is involved. */
async function handleImport(request,env,ctx){
  const t=await tokenCheck(env,request.headers.get('authorization'));
  if(t==='disabled')return bad(503,'import_disabled');if(t!=='ok')return bad(401,'unauthorized');
  await ensureSchema(env);
  const c={env,ctx,request,body:{},user:{id:'import',name:'import',admin:true,superadmin:true}};
  const url=new URL(request.url);
  for(const r of routes){
    if(r.admin!=='token'||r.method!==request.method)continue;const m=r.re.exec(url.pathname);if(!m)continue;
    if(request.method!=='GET'){if(+request.headers.get('content-length')>4_500_000)return bad(413,'toolarge');try{c.body=await request.json()}catch{c.body={}}}
    return r.fn(c,...m.slice(1));
  }
  return bad(404,'not found');
}
async function handleApi(request,env,ctx){
  const c={env,ctx,request,body:{}};
  /* The x-dev-user shortcut exists for local development only: it must never work on a deployed host, even if BOT_TOKEN is missing. */
  const host=new URL(request.url).hostname,dev=!env.BOT_TOKEN&&(host==='localhost'||host==='127.0.0.1'||host==='[::1]');let u=null;const h=request.headers.get('authorization')||'';
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
    if(r.admin==='token')continue;
    if(r.admin&&!c.user.admin)return bad(403,'forbidden');
    if(request.method!=='GET'){if(+request.headers.get('content-length')>4_500_000)return bad(413,'toolarge');try{c.body=await request.json()}catch{c.body={}}}
    await run(c,'INSERT INTO users(id,name,created,last_seen) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=COALESCE(users.name,excluded.name),last_seen=excluded.last_seen,blocked=0',id,name,Date.now(),Date.now());
    if((await get(c,'SELECT banned FROM users WHERE id=?',id))?.banned&&!c.user.superadmin)return bad(403,'banned');
    return r.fn(c,...m.slice(1));
  }
  return bad(404,'not found');
}

/* ---------- notification preferences (bot) ---------- */
const NOTIF_DEFAULT={chapters:true,replies:true,reminder:false,authors:true};
const NOTIF_LABELS={ru:{replies:'Ответы на мои отзывы',reminder:'Напоминание о чтении',authors:'Книги подписанных авторов',chapters:'Новости и новые книги'},uz:{replies:'Sharhlarimga javoblar',reminder:'O‘qish eslatmasi',authors:'Obuna mualliflarining kitoblari',chapters:'Yangiliklar va yangi kitoblar'}};
const getNotif=async(c,uid)=>{const u=await get(c,'SELECT state FROM users WHERE id=?',uid);const st=P(u?.state||'{}');return{st,notif:{...NOTIF_DEFAULT,...(st.notif||{})}}};
const saveNotif=(c,uid,st,notif)=>run(c,'UPDATE users SET state=? WHERE id=?',J({...st,notif}),uid);
const notifKeyboard=(notif,lang)=>({inline_keyboard:Object.keys(NOTIF_DEFAULT).map(k=>[{text:`${notif[k]?'✅':'⬜️'} ${NOTIF_LABELS[lang][k]}`,callback_data:'n:'+k}])});
const notifText=lang=>lang==='uz'?'Qaysi bildirishnomalarni olmoqchisiz? Bosib yoqing yoki o‘chiring.':'Какие уведомления вы хотите получать? Нажмите, чтобы включить или выключить.';
async function onCallback(c,q){
  const env=c.env,uid=String(q.from.id),lang=(q.from.language_code||'').startsWith('uz')?'uz':'ru',m=q.data||'';
  if(m.startsWith('bv:')){
    const [,bid,oi]=m.split(':'),idx=+oi,b=await get(c,"SELECT id,options,status FROM broadcasts WHERE id=? AND kind='poll'",bid),opts=b?P(b.options||'[]'):[];
    if(!b||!Number.isInteger(idx)||idx<0||idx>=opts.length)return void await tgApi(env,'answerCallbackQuery',{callback_query_id:q.id});
    await run(c,'INSERT INTO survey_votes(broadcast_id,user_id,opt,ts) VALUES(?,?,?,?) ON CONFLICT(broadcast_id,user_id) DO UPDATE SET opt=excluded.opt,ts=excluded.ts',bid,uid,idx,Date.now());
    const mark=opts.map((o,i)=>[{text:(i===idx?'✅ ':'')+o,callback_data:`bv:${bid}:${i}`}]);
    await Promise.all([q.message?tgApi(env,'editMessageReplyMarkup',{chat_id:q.message.chat.id,message_id:q.message.message_id,reply_markup:{inline_keyboard:mark}}):0,tgApi(env,'answerCallbackQuery',{callback_query_id:q.id,text:lang==='uz'?'Rahmat, javobingiz qabul qilindi':'Спасибо, ответ записан'})]);
    return;
  }
  if(!m.startsWith('n:')||!(m.slice(2) in NOTIF_DEFAULT)||!q.message)return void await tgApi(env,'answerCallbackQuery',{callback_query_id:q.id});
  const {st,notif}=await getNotif(c,uid);notif[m.slice(2)]=!notif[m.slice(2)];await saveNotif(c,uid,st,notif);
  await Promise.all([tgApi(env,'editMessageReplyMarkup',{chat_id:q.message.chat.id,message_id:q.message.message_id,reply_markup:notifKeyboard(notif,lang)}),tgApi(env,'answerCallbackQuery',{callback_query_id:q.id,text:lang==='uz'?'Saqlandi':'Сохранено'})]);
}

/** Private chat with the bot: commands, plus any plain text becomes a support message for the admins. */
async function onBotMessage(c,m){
  const env=c.env,uz=(m.from?.language_code||'').startsWith('uz'),lang=uz?'uz':'ru',chat=m.chat.id,uid=String(m.from.id);
  const T=(ru,u)=>uz?u:ru;
  const name=clip([m.from.first_name,m.from.last_name].filter(Boolean).join(' '),40)||null;
  await run(c,'INSERT INTO users(id,name,created,last_seen) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET blocked=0,last_seen=excluded.last_seen',uid,name,Date.now(),Date.now());
  if((await get(c,'SELECT banned FROM users WHERE id=?',uid))?.banned)return;
  const text=m.text.trim(),cmd=text.startsWith('/')?text.split(/[\s@]/)[0].toLowerCase():'';
  const send=(t,open)=>tgApi(env,'sendMessage',{chat_id:chat,text:t,...openBtn(env,{lang,open})});
  const help=()=>send(T('Что я умею:\n/library — продолжить чтение\n/donate — поддержать проект\n/support — написать в поддержку\n/notifications — настроить уведомления\n/stop — отключить все уведомления\n\nЛюбое обычное сообщение попадёт к администратору, ответ придёт сюда.','Men nimalar qila olaman:\n/library — o‘qishni davom ettirish\n/donate — loyihani qo‘llab-quvvatlash\n/support — yordamga yozish\n/notifications — bildirishnomalarni sozlash\n/stop — barcha bildirishnomalarni o‘chirish\n\nIstalgan oddiy xabar administratorga yetadi, javob shu yerga keladi.'));
  if(cmd==='/start')return void await send(await getWelcome(c,lang));
  if(cmd==='/notifications'){const {notif}=await getNotif(c,uid);return void await tgApi(env,'sendMessage',{chat_id:chat,text:notifText(lang),reply_markup:notifKeyboard(notif,lang)})}
  if(cmd==='/stop'){const {st,notif}=await getNotif(c,uid);Object.keys(notif).forEach(k=>notif[k]=false);await saveNotif(c,uid,st,notif);return void await send(T('Уведомления отключены. Включить снова: /notifications','Bildirishnomalar o‘chirildi. Qayta yoqish: /notifications'))}
  if(cmd==='/library')return void await send(T('Ваша библиотека и прогресс чтения:','Kutubxonangiz va o‘qish jarayoni:'),'library');
  if(cmd==='/donate')return void await send(T('Поддержите развитие Muloqot Books 💛','Muloqot Books rivojiga hissa qo‘shing 💛'),'donate');
  if(cmd==='/support')return void await send(T('Напишите ваш вопрос одним сообщением прямо сюда. Ответ придёт в этот чат.','Savolingizni shu yerga yozing. Javob shu chatga keladi.'));
  if(cmd)return void await help();
  if(cmd==='/help')return;
  if((await get(c,'SELECT COUNT(*) n FROM support_messages WHERE user_id=? AND from_admin=0 AND created>?',uid,Date.now()-6e4)).n>=10)return;
  const unreadBefore=(await get(c,'SELECT COUNT(*) n FROM support_messages WHERE user_id=? AND from_admin=0 AND read=0',uid)).n;
  await run(c,'INSERT INTO support_messages(user_id,from_admin,text,created,read) VALUES(?,?,?,?,0)',uid,0,clip(text,2000),Date.now());
  if(!unreadBefore)await notifyAdmins(c,'support',`Новое сообщение в поддержку\n${personName(name,uid)}: «${clip(text,200)}»`);
  await tgApi(env,'sendMessage',{chat_id:chat,text:T('Спасибо! Сообщение передано администратору, ответ придёт сюда ✅','Rahmat! Xabaringiz administratorga yuborildi, javob shu yerga keladi ✅')});
}

async function handleWebhook(request,env,ctx){
  const h=request.headers.get('x-telegram-bot-api-secret-token');
  if(!env.BOT_TOKEN||(h!==await webhookSecret(env)&&(!env.WEBHOOK_SECRET||h!==env.WEBHOOK_SECRET)))return new Response('forbidden',{status:403});
  const u=await request.json().catch(()=>null);if(!u)return new Response('ok');
  const c={env,ctx};await ensureSchema(env);
  if(u.pre_checkout_query){
    const q=u.pre_checkout_query,d=await get(c,'SELECT status FROM donations WHERE id=?',q.invoice_payload);
    await tgApi(env,'answerPreCheckoutQuery',d&&d.status==='pending'?{pre_checkout_query_id:q.id,ok:true}:{pre_checkout_query_id:q.id,ok:false,error_message:'Платёж не найден или уже оплачен'});
  }else if(u.message?.successful_payment){
    await onPaid(c,u.message.successful_payment,u.message.from?.id);
  }else if(u.inline_query)await onInline(c,u.inline_query);
  else if(u.callback_query)await onCallback(c,u.callback_query);
  else if(u.message?.text&&u.message.chat?.type==='private')await onBotMessage(c,u.message);
  return new Response('ok');
}

/** Reading reminders: the cron fires every 5 minutes from 19:00 Tashkent; each run handles a small batch (subrequest-safe) and marks users as reminded for the day. */
async function reminders(env,ctx){
  const c={env,ctx},today=new Date(Date.now()+5*36e5).toISOString().slice(0,10);
  await ensureSchema(env);
  const users=await all(c,"SELECT id,state FROM users WHERE state LIKE '%\"reminder\":true%' AND (reminded IS NULL OR reminded<>?) AND banned=0 AND blocked=0 LIMIT 18",today);
  if(!users.length)return;
  const titles=Object.fromEntries((await all(c,"SELECT id,json_extract(data,'$.title') t FROM books WHERE (hidden=0 OR hidden IS NULL) AND json_extract(data,'$.publish') IS NOT 'draft'")).map(b=>[b.id,b.t]));
  for(const u of users){
    const s=P(u.state||'{}'),uz=s.lang==='uz';
    if(s.notif?.reminder&&!(s.days||[]).includes(today)){
      const rows=await all(c,'SELECT book_id,locator,updated FROM reading_progress WHERE user_id=? ORDER BY updated DESC LIMIT 6',u.id);
      const prog=rows.length?rows.map(r=>[r.book_id,{ch:P(r.locator).ch,ts:r.updated}]):Object.entries(s.progress||{});
      const cur=prog.filter(([id])=>titles[id]&&!(s.finished||[]).includes(id)).sort((a,b)=>(b[1].ts||0)-(a[1].ts||0))[0];
      const text=cur?(uz?`Siz «${titles[cur[0]]}» kitobida ${cur[1].ch+1}-bobda to‘xtagansiz. Davom ettiramizmi? 📖`:`Вы остановились на «${titles[cur[0]]}», глава ${cur[1].ch+1}. Продолжим? 📖`):(uz?'O‘qish vaqti 📖 Bugun hali kitob ochmadingiz.':'Время почитать 📖 Сегодня вы ещё не открывали книгу.');
      await tgApi(env,'sendMessage',{chat_id:u.id,text,...openBtn(env,{lang:uz?'uz':'ru',open:cur?'read_'+cur[0]:'library'})});
    }
    await run(c,'UPDATE users SET reminded=? WHERE id=?',today,u.id);
  }
}

/** A token pasted into the dashboard often carries a trailing space or newline; normalise it once. */
const clean=env=>Object.assign(Object.create(env),{BOT_TOKEN:String(env.BOT_TOKEN||'').trim().replace(/^bot/i,''),WEBHOOK_SECRET:String(env.WEBHOOK_SECRET||'').trim()});
LIB=registerLibrary({route,stmt,get,all,run,batch,json,bad,P,J,audit,id8});
registerAi({route,get,run,json,bad,P,J,audit});
export default {
  async fetch(request,env0,ctx){
    const env=clean(env0);
    const {pathname,origin}=new URL(request.url);ORIGIN=origin;
    const bm=/^\/api\/bcmedia\/([a-f0-9]{20})$/.exec(pathname);
    if(bm&&request.method==='GET'){
      const row=await env.DB.prepare('SELECT mime,data FROM broadcast_media WHERE id=?').bind(bm[1]).first();
      if(!row)return new Response('not found',{status:404});
      return new Response(Uint8Array.from(atob(row.data),ch=>ch.charCodeAt(0)),{headers:{'content-type':row.mime,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
    }
    const bp=/^\/b\/([\w-]+)$/.exec(pathname);
    if(bp&&request.method==='GET'){
      const c={env},row=await all(c,BOOK_ROW_SQL+' AND b.id=?',bp[1]).then(r=>r[0]).catch(()=>null);
      if(!row)return new Response('not found',{status:404});
      const lang=(request.headers.get('accept-language')||'').startsWith('uz')?'uz':'ru',gi=lang==='uz'?1:0,rt=cardRating(row),genre=(GENRE_NAME[row.g]||[])[gi]||'';
      const line1=[row.an,row.y].filter(Boolean).join(' · '),line2=[genre,String(row.lg||'').toUpperCase(),rt?`⭐ ${rt.v}`:''].filter(Boolean).join(' · ');
      const link=await getAppLink(c),go=link?`${link}?startapp=book_${row.id}`:origin,at=x=>hesc(x).replace(/"/g,'&quot;');
      const html=`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${hesc(row.t)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta property="og:type" content="book"><meta property="og:site_name" content="Muloqot Books"><meta property="og:title" content="${at(row.t)}"><meta property="og:description" content="${at(line1+'\n'+line2)}">${row.img?`<meta property="og:image" content="${origin}/api/cover/${row.id}">`:''}<meta http-equiv="refresh" content="0;url=${at(go)}"></head><body style="font-family:sans-serif;background:#111;color:#eee;padding:24px"><h1>${hesc(row.t)}</h1><p>${hesc(line1)}</p><p><a style="color:#8ab4ff" href="${at(go)}">Muloqot Books</a></p></body></html>`;
      return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300'}});
    }
    const cv=/^\/api\/cover\/([\w-]+)$/.exec(pathname);
    if(cv&&request.method==='GET'){
      const row=await env.DB.prepare("SELECT data FROM books WHERE id=? AND json_extract(data,'$.publish') IS NOT 'draft' AND (hidden=0 OR hidden IS NULL)").bind(cv[1]).first();const img=row&&P(row.data).img;
      const m=img&&/^data:(image\/[\w.+-]+);base64,(.+)$/.exec(img);
      if(!m)return new Response('not found',{status:404});
      const bin=atob(m[2]),bytes=Uint8Array.from(bin,ch=>ch.charCodeAt(0));
      return new Response(bytes,{headers:{'content-type':m[1],'cache-control':'public, max-age=86400'}});
    }
    if(pathname==='/api/health'){const t=env.BOT_TOKEN;{const al=env.DB?await env.DB.prepare("SELECT value FROM meta WHERE key='applink'").first().catch(()=>null):null;return json({bot:!!t,botId:t.split(':')[0]||null,format:/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(t),db:!!env.DB,admins:csv(env.ADMIN_IDS).length,appLink:al?JSON.parse(al.value):''})}}
    try{
      if(pathname==='/telegram/webhook'&&request.method==='POST')return await handleWebhook(request,env,ctx);
      if(pathname.startsWith('/api/import/'))return await handleImport(request,env,ctx);
      if(pathname.startsWith('/api/'))return await handleApi(request,env,ctx);
    }catch(e){console.error(e);return json({error:'server',...(pathname.startsWith('/api/admin/')?{detail:String(e.message||e).slice(0,200)}:{})},500)}
    return env.ASSETS.fetch(request);
  },
  scheduled(event,env,ctx){ctx.waitUntil(reminders(clean(env),ctx))}
};
