import express from 'express';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {db} from './db.js';
import {verifyInitData} from './auth.js';
import {notify} from './notify.js';
import {parseManuscript} from './parse.js';
import {startBot} from './bot.js';

const app=express();
const J=JSON.stringify,P=s=>JSON.parse(s);
const ADMINS=(process.env.ADMIN_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
const DEV=!process.env.BOT_TOKEN;
const clip=(s,n)=>String(s??'').trim().slice(0,n);
const id8=()=>randomUUID().slice(0,8);
const GENRES=['novel','detective','historical','adventure','drama','stories','modern'];
const LOCAL=['state','reviews','threads','subs','reacts','qLikes','follows','ratings'];

app.use(express.json({limit:'6mb'}));

/* ---------- auth ---------- */
app.use('/api',(req,res,next)=>{
  let u=null;const h=req.get('authorization')||'';
  if(h.startsWith('tma '))u=verifyInitData(h.slice(4),process.env.BOT_TOKEN||'');
  else if(DEV&&req.get('x-dev-user'))u={id:clip(req.get('x-dev-user'),32).replace(/[^\w-]/g,''),first_name:'Dev'};
  if(!u||!u.id)return res.status(401).json({error:'unauthorized'});
  const id=String(u.id),name=clip([u.first_name,u.last_name].filter(Boolean).join(' ')||u.username||'Reader',40);
  db.prepare('INSERT INTO users(id,name,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=COALESCE(users.name,excluded.name)').run(id,name,Date.now());
  req.user={id,name,admin:ADMINS.includes(id)||(DEV&&id==='admin')};
  next();
});

/* ---------- serializers ---------- */
const rel=ms=>{const m=Math.max(0,Math.floor((Date.now()-ms)/6e4));
  if(m<2)return{ru:'только что',uz:'hozirgina'};if(m<60)return{ru:`${m} мин назад`,uz:`${m} daqiqa oldin`};
  const h=Math.floor(m/60);if(h<24)return{ru:`${h} ч назад`,uz:`${h} soat oldin`};
  const d=Math.floor(h/24);if(d<14)return{ru:`${d} дн. назад`,uz:`${d} kun oldin`};
  const w=Math.floor(d/7);return{ru:`${w} нед. назад`,uz:`${w} hafta oldin`}};
const bookOut=(r)=>{const b=P(r.data);const real=db.prepare('SELECT COUNT(*) n,COALESCE(SUM(value),0) s FROM ratings WHERE book_id=?').get(r.id);
  const count=b.count+real.n;return{...b,count,rating:Math.round((b.rating*b.count+real.s)/count*100)/100}};
const authorOut=r=>({...P(r.data),followers:r.followers_base+db.prepare('SELECT COUNT(*) n FROM follows WHERE author_id=?').get(r.id).n});
const mineOf=(uid,target)=>{const o={};db.prepare('SELECT kind FROM reacts WHERE user_id=? AND target=?').all(uid,target).forEach(x=>o[x.kind]=true);return o};
const cnt=(target,kind)=>db.prepare('SELECT COUNT(*) n FROM reacts WHERE target=? AND kind=?').get(target,kind).n;
function reviewOut(r,uid){
  return{id:r.id,bookId:r.book_id,user:r.user_name,rating:r.rating,text:r.text,date:rel(r.created),mine:r.user_id===uid,
    likes:r.likes_base+cnt('r:'+r.id,'heart'),insight:r.insight_base+cnt('r:'+r.id,'insight'),my:mineOf(uid,'r:'+r.id),
    replies:db.prepare('SELECT user_name user,text,is_author author FROM review_replies WHERE review_id=? ORDER BY id').all(r.id).map(x=>({user:x.user,text:x.text,...(x.author?{author:1}:{})}))};
}
function threadOut(t){
  const cs=db.prepare('SELECT * FROM comments WHERE thread_id=? ORDER BY id').all(t.id);
  const top=cs.filter(c=>!c.parent_id).map(c=>({id:c.id,user:c.user_name,text:c.text,replies:cs.filter(x=>x.parent_id===c.id).map(x=>({user:x.user_name,text:x.text}))}));
  return{id:t.id,bookId:t.book_id,title:t.title,user:t.user_name,text:t.text,comments:top};
}
const quoteOut=(q,uid)=>({id:q.id,bookId:q.book_id,text:q.text,likes:q.likes_base+cnt('q:'+q.id,'heart'),mine:!!mineOf(uid,'q:'+q.id).heart});
const subOut=s=>({id:s.id,title:s.title,status:s.status,note:s.note||'',bookId:s.book_id||null});
const allReviews=uid=>db.prepare('SELECT * FROM reviews ORDER BY created DESC LIMIT 200').all().map(r=>reviewOut(r,uid));
const allThreads=()=>db.prepare('SELECT * FROM threads ORDER BY created DESC LIMIT 100').all().map(threadOut);

/* ---------- bootstrap & state ---------- */
app.get('/api/bootstrap',(req,res)=>{
  const uid=req.user.id;
  const u=db.prepare('SELECT state FROM users WHERE id=?').get(uid);
  res.json({
    me:{id:uid,name:req.user.name,admin:req.user.admin},
    books:db.prepare('SELECT * FROM books').all().map(bookOut),
    authors:db.prepare('SELECT * FROM authors').all().map(authorOut),
    collections:P(db.prepare("SELECT value FROM meta WHERE key='collections'").get().value),
    weekly:P(db.prepare("SELECT value FROM meta WHERE key='weekly'").get().value),
    quotes:db.prepare('SELECT * FROM quotes').all().map(q=>quoteOut(q,uid)),
    reviews:allReviews(uid),threads:allThreads(),
    ratings:Object.fromEntries(db.prepare('SELECT book_id,value FROM ratings WHERE user_id=?').all(uid).map(r=>[r.book_id,r.value])),
    follows:db.prepare('SELECT author_id FROM follows WHERE user_id=?').all(uid).map(r=>r.author_id),
    subs:db.prepare('SELECT * FROM submissions WHERE user_id=? ORDER BY created DESC').all(uid).map(subOut),
    state:P(u.state||'{}')
  });
});
app.put('/api/state',(req,res)=>{
  const s={...req.body};LOCAL.forEach(k=>delete s[k]);
  const txt=J(s);if(txt.length>300_000)return res.status(413).json({error:'too large'});
  db.prepare('UPDATE users SET state=? WHERE id=?').run(txt,req.user.id);res.json({ok:true});
});

/* ---------- books / authors ---------- */
app.post('/api/books/:id/rate',(req,res)=>{
  const row=db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id);if(!row)return res.status(404).end();
  const v=Math.round(+req.body.value);if(!(v>=1&&v<=5))return res.status(400).json({error:'value'});
  db.prepare('INSERT INTO ratings VALUES(?,?,?) ON CONFLICT(user_id,book_id) DO UPDATE SET value=excluded.value').run(req.user.id,row.id,v);
  const b=bookOut(row);res.json({rating:b.rating,count:b.count});
});
app.post('/api/authors/:id/follow',(req,res)=>{
  const a=db.prepare('SELECT * FROM authors WHERE id=?').get(req.params.id);if(!a)return res.status(404).end();
  if(req.body.on)db.prepare('INSERT OR IGNORE INTO follows VALUES(?,?)').run(req.user.id,a.id);else db.prepare('DELETE FROM follows WHERE user_id=? AND author_id=?').run(req.user.id,a.id);
  res.json({followers:authorOut(a).followers});
});

/* ---------- reviews ---------- */
app.post('/api/reviews',(req,res)=>{
  const {bookId,rating}=req.body;const text=clip(req.body.text,2000);
  if(!db.prepare('SELECT 1 FROM books WHERE id=?').get(bookId)||!(rating>=1&&rating<=5)||text.length<10)return res.status(400).json({error:'invalid'});
  const id='u'+id8();
  db.prepare('INSERT INTO reviews(id,book_id,user_id,user_name,rating,text,created) VALUES(?,?,?,?,?,?,?)').run(id,bookId,req.user.id,req.user.name,Math.round(rating),text,Date.now());
  db.prepare('INSERT INTO ratings VALUES(?,?,?) ON CONFLICT(user_id,book_id) DO UPDATE SET value=excluded.value').run(req.user.id,bookId,Math.round(rating));
  const b=bookOut(db.prepare('SELECT * FROM books WHERE id=?').get(bookId));
  res.json({review:reviewOut(db.prepare('SELECT * FROM reviews WHERE id=?').get(id),req.user.id),rating:b.rating,count:b.count});
});
app.post('/api/reviews/:id/react',(req,res)=>{
  const r=db.prepare('SELECT * FROM reviews WHERE id=?').get(req.params.id);if(!r)return res.status(404).end();
  const k=req.body.kind==='insight'?'insight':'heart',t='r:'+r.id;
  if(req.body.on)db.prepare('INSERT OR IGNORE INTO reacts VALUES(?,?,?)').run(req.user.id,t,k);else db.prepare('DELETE FROM reacts WHERE user_id=? AND target=? AND kind=?').run(req.user.id,t,k);
  const o=reviewOut(r,req.user.id);res.json({likes:o.likes,insight:o.insight});
});
app.post('/api/reviews/:id/replies',(req,res)=>{
  const r=db.prepare('SELECT * FROM reviews WHERE id=?').get(req.params.id);const text=clip(req.body.text,1000);
  if(!r||!text)return res.status(400).end();
  const owner=db.prepare('SELECT a.user_id FROM books b JOIN authors a ON a.id=json_extract(b.data,\'$.a\') WHERE b.id=?').get(r.book_id);
  db.prepare('INSERT INTO review_replies(review_id,user_id,user_name,text,is_author,created) VALUES(?,?,?,?,?,?)').run(r.id,req.user.id,req.user.name,text,owner?.user_id===req.user.id?1:0,Date.now());
  if(r.user_id&&r.user_id!==req.user.id){const n=P(db.prepare('SELECT state FROM users WHERE id=?').get(r.user_id)?.state||'{}').notif;if(!n||n.replies!==false)notify(r.user_id,`${req.user.name} ответил(а) на ваш отзыв: «${text.slice(0,120)}»`)}
  res.json({review:reviewOut(r,req.user.id)});
});

/* ---------- threads ---------- */
app.post('/api/threads',(req,res)=>{
  const title=clip(req.body.title,200);if(!title)return res.status(400).end();
  const bookId=req.body.bookId&&db.prepare('SELECT 1 FROM books WHERE id=?').get(req.body.bookId)?req.body.bookId:null;
  const id='t'+id8();db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?)').run(id,bookId,req.user.id,req.user.name,title,'',Date.now());
  res.json({thread:threadOut(db.prepare('SELECT * FROM threads WHERE id=?').get(id))});
});
app.post('/api/threads/:id/comments',(req,res)=>{
  const t=db.prepare('SELECT * FROM threads WHERE id=?').get(req.params.id);const text=clip(req.body.text,1000);
  if(!t||!text)return res.status(400).end();
  let parent=null;if(req.body.parentId){const p=db.prepare('SELECT * FROM comments WHERE id=? AND thread_id=? AND parent_id IS NULL').get(req.body.parentId,t.id);if(!p)return res.status(400).end();parent=p.id;
    if(p.user_id&&p.user_id!==req.user.id)notify(p.user_id,`${req.user.name} ответил(а) на ваш комментарий в «${t.title}»`)}
  db.prepare('INSERT INTO comments(thread_id,parent_id,user_id,user_name,text,created) VALUES(?,?,?,?,?,?)').run(t.id,parent,req.user.id,req.user.name,text,Date.now());
  res.json({thread:threadOut(t)});
});

/* ---------- quotes ---------- */
app.post('/api/quotes/:id/like',(req,res)=>{
  const q=db.prepare('SELECT * FROM quotes WHERE id=?').get(req.params.id);if(!q)return res.status(404).end();
  if(req.body.on)db.prepare('INSERT OR IGNORE INTO reacts VALUES(?,?,?)').run(req.user.id,'q:'+q.id,'heart');else db.prepare('DELETE FROM reacts WHERE user_id=? AND target=? AND kind=?').run(req.user.id,'q:'+q.id,'heart');
  res.json({likes:quoteOut(q,req.user.id).likes});
});
/* A reader shares a saved quote with everyone. */
app.post('/api/quotes',(req,res)=>{
  const text=clip(req.body.text,500);if(!text||!db.prepare('SELECT 1 FROM books WHERE id=?').get(req.body.bookId))return res.status(400).end();
  const id='q'+id8();db.prepare('INSERT INTO quotes(id,book_id,text,likes_base) VALUES(?,?,?,0)').run(id,req.body.bookId,text);
  res.json({quote:quoteOut(db.prepare('SELECT * FROM quotes WHERE id=?').get(id),req.user.id)});
});

/* ---------- author submissions ---------- */
app.post('/api/submissions',(req,res)=>{
  const b=req.body,title=clip(b.title,120),desc=clip(b.desc,3000),body=String(b.body||'').slice(0,2_000_000);
  if(title.length<2||desc.length<20)return res.status(400).json({error:'invalid'});
  if(body.trim().length<500)return res.status(400).json({error:'manuscript'});
  const cover=typeof b.cover==='string'&&b.cover.startsWith('data:image/')&&b.cover.length<4_500_000?b.cover:null;
  const id='s'+id8();
  db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,req.user.id,title,clip(b.author,60)||req.user.name,b.lang==='uz'?'uz':'ru',GENRES.includes(b.genre)?b.genre:'novel',desc,clip(b.tags,200),cover,clip(b.fileName,120),body,'moderation','',null,Date.now());
  ADMINS.forEach(a=>notify(a,`Новая заявка на модерацию: «${title}»`));
  res.json({sub:subOut(db.prepare('SELECT * FROM submissions WHERE id=?').get(id))});
});
const adminOnly=(req,res,next)=>req.user.admin?next():res.status(403).json({error:'forbidden'});
app.get('/api/admin/submissions',adminOnly,(req,res)=>{
  res.json(db.prepare("SELECT * FROM submissions WHERE status='moderation' ORDER BY created").all().map(s=>({...subOut(s),author:s.author_name,lang:s.lang,genre:s.genre,desc:s.description,chars:s.body.length})));
});
app.post('/api/admin/submissions/:id/reject',adminOnly,(req,res)=>{
  const s=db.prepare("SELECT * FROM submissions WHERE id=? AND status='moderation'").get(req.params.id);if(!s)return res.status(404).end();
  const note=clip(req.body.note,300);db.prepare("UPDATE submissions SET status='rejected',note=? WHERE id=?").run(note,s.id);
  notify(s.user_id,`Заявка «${s.title}» отклонена.${note?' '+note:''}`);res.json({ok:true});
});
app.post('/api/admin/submissions/:id/approve',adminOnly,(req,res)=>{
  const s=db.prepare("SELECT * FROM submissions WHERE id=? AND status='moderation'").get(req.params.id);if(!s)return res.status(404).end();
  const chapters=parseManuscript(s.body);if(!chapters.length)return res.status(400).json({error:'empty'});
  let a=db.prepare('SELECT * FROM authors WHERE user_id=? OR lower(json_extract(data,\'$.name\'))=lower(?)').get(s.user_id,s.author_name);
  if(!a){const aid='a'+id8();const pal=[['#2a1a14','#7a2e17'],['#10282c','#2f6672'],['#26141a','#7a3346'],['#2a1f12','#8a5a22']][aid.charCodeAt(1)%4];
    db.prepare('INSERT INTO authors VALUES(?,?,?,?)').run(aid,J({id:aid,name:s.author_name,city:{ru:'',uz:''},hair:'short',hairc:'#2a1c12',skin:'#d3ab88',glasses:0,pal,bio:{ru:'',uz:''}}),0,s.user_id);
    a=db.prepare('SELECT * FROM authors WHERE id=?').get(aid)}
  const bid='b'+id8();const chars=chapters.reduce((n,c)=>n+c.p.join('').length,0);
  const motifs=['window','tree','train','caravan','books','tea','river','door','mount','bird','clock','ornament'];
  const pals=[['#2a1a14','#7a2e17','#e8742f','#140c09','#f0dfc6'],['#101418','#1d2a2e','#d8552a','#0a0d0f','#e9dcc3'],['#17201d','#2d4a42','#e07a2f','#0e1411','#efe1c2'],['#1c1416','#5a2230','#f08f45','#100a0c','#f1ddc3']];
  const h=[...s.id].reduce((x,c)=>x+c.charCodeAt(0),0);
  const maxAdded=db.prepare('SELECT COALESCE(MAX(added),0) m FROM books').get().m;
  const book={id:bid,a:a.id,title:s.title,lang:s.lang,genre:s.genre,rating:4,count:0,pages:Math.max(1,Math.round(chars/1800)),year:new Date().getFullYear(),added:maxAdded+1,motif:motifs[h%motifs.length],pal:pals[h%pals.length],desc:s.description,chapters,...(s.cover?{img:s.cover}:{})};
  db.prepare('INSERT INTO books VALUES(?,?,?)').run(bid,J(book),book.added);
  db.prepare("UPDATE submissions SET status='approved',book_id=? WHERE id=?").run(bid,s.id);
  notify(s.user_id,`Книга «${s.title}» опубликована в каталоге!`);
  db.prepare('SELECT f.user_id,u.state FROM follows f JOIN users u ON u.id=f.user_id WHERE f.author_id=?').all(a.id).forEach(f=>{if(P(f.state||'{}').notif?.authors!==false)notify(f.user_id,`Новая книга автора ${s.author_name}: «${s.title}»`)});
  res.json({bookId:bid});
});

/* ---------- reading reminders (19:00 Tashkent) ---------- */
const tz=d=>new Date(d.getTime()+5*36e5);
setInterval(()=>{
  const now=tz(new Date());if(now.getUTCHours()!==19||now.getUTCMinutes()>=1)return;
  const today=now.toISOString().slice(0,10);
  db.prepare('SELECT id,state FROM users').all().forEach(u=>{const s=P(u.state||'{}');if(s.notif?.reminder&&!(s.days||[]).includes(today))notify(u.id,'Время почитать 📖 Сегодня вы ещё не открывали книгу.')});
},60_000).unref();

/* ---------- static ---------- */
const dist=join(dirname(fileURLToPath(import.meta.url)),'..','dist');
if(existsSync(dist)){app.use(express.static(dist));app.get(/^(?!\/api).*/,(q,r)=>r.sendFile(join(dist,'index.html')))}
app.use((e,req,res,next)=>{console.error(e);res.status(500).json({error:'server'})});
const port=process.env.PORT||3000;
app.listen(port,()=>{console.log(`Muloqot Books on :${port}${DEV?' (dev auth: x-dev-user)':''}`);startBot()});
