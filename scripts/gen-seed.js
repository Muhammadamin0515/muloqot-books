// Generates migrations/0002_seed.sql from src/data.js. Run: npm run gen-seed
import {writeFileSync} from 'node:fs';
import {AUTHORS,BOOKS,COLLECTIONS,SEED_REVIEWS,SEED_THREADS,SEED_QUOTES,WEEKLY} from '../src/data.js';
const q=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replace(/'/g,"''")}'`;
const J=JSON.stringify,out=[],now=Date.now(),H=36e5;
const ins=(t,cols,...vals)=>out.push(`INSERT INTO ${t}(${cols}) VALUES(${vals.map(q).join(',')});`);
AUTHORS.forEach(({followers,...a})=>ins('authors','id,data,followers_base',a.id,J(a),followers));
BOOKS.forEach(b=>ins('books','id,data,added',b.id,J(b),b.added));
SEED_REVIEWS.forEach((r,i)=>{const t=now-(i+1)*30*H;ins('reviews','id,book_id,user_id,user_name,rating,text,created,likes_base,insight_base',r.id,r.bookId,null,r.user,r.rating,r.text,t,r.likes,r.insight);
  r.replies.forEach(x=>ins('review_replies','review_id,user_id,user_name,text,is_author,created',r.id,null,x.user,x.text,x.author?1:0,t+H))});
let cid=0;
SEED_THREADS.forEach((th,i)=>{const t=now-(i+1)*20*H;ins('threads','id,book_id,user_id,user_name,title,text,created',th.id,th.bookId,null,th.user,th.title,th.text,t);
  th.comments.forEach(c=>{const id=++cid;ins('comments','id,thread_id,parent_id,user_id,user_name,text,created',id,th.id,null,null,c.user,c.text,t+H);
    c.replies.forEach(x=>{++cid;ins('comments','id,thread_id,parent_id,user_id,user_name,text,created',cid,th.id,id,null,x.user,x.text,t+2*H)})})});
SEED_QUOTES.forEach(x=>ins('quotes','id,book_id,text,likes_base',x.id,x.bookId,x.text,x.likes));
ins('meta','key,value','collections',J(COLLECTIONS));ins('meta','key,value','weekly',J(WEEKLY));
writeFileSync(new URL('../migrations/0002_seed.sql',import.meta.url),out.join('\n')+'\n');
console.log(out.length,'statements');
