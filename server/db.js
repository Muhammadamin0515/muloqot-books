import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {AUTHORS,BOOKS,COLLECTIONS,SEED_REVIEWS,SEED_THREADS,SEED_QUOTES,WEEKLY} from '../src/data.js';

const file=process.env.DB_PATH||'data/muloqot.db';
if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
export const db=new DatabaseSync(file);
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,state TEXT DEFAULT '{}',created INTEGER);
CREATE TABLE IF NOT EXISTS authors(id TEXT PRIMARY KEY,data TEXT,followers_base INTEGER DEFAULT 0,user_id TEXT);
CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,data TEXT,added INTEGER);
CREATE TABLE IF NOT EXISTS ratings(user_id TEXT,book_id TEXT,value INTEGER,PRIMARY KEY(user_id,book_id));
CREATE TABLE IF NOT EXISTS follows(user_id TEXT,author_id TEXT,PRIMARY KEY(user_id,author_id));
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,book_id TEXT,user_id TEXT,user_name TEXT,rating INTEGER,text TEXT,created INTEGER,likes_base INTEGER DEFAULT 0,insight_base INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS review_replies(id INTEGER PRIMARY KEY AUTOINCREMENT,review_id TEXT,user_id TEXT,user_name TEXT,text TEXT,is_author INTEGER DEFAULT 0,created INTEGER);
CREATE TABLE IF NOT EXISTS reacts(user_id TEXT,target TEXT,kind TEXT,PRIMARY KEY(user_id,target,kind));
CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY,book_id TEXT,user_id TEXT,user_name TEXT,title TEXT,text TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY AUTOINCREMENT,thread_id TEXT,parent_id INTEGER,user_id TEXT,user_name TEXT,text TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,book_id TEXT,text TEXT,likes_base INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,user_id TEXT,title TEXT,author_name TEXT,lang TEXT,genre TEXT,description TEXT,tags TEXT,cover TEXT,file_name TEXT,body TEXT,status TEXT,note TEXT,book_id TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
`);

const J=JSON.stringify;
function seed(){
  if(db.prepare('SELECT COUNT(*) n FROM books').get().n)return;
  const now=Date.now(),H=36e5;
  db.exec('BEGIN');
  const ia=db.prepare('INSERT INTO authors(id,data,followers_base) VALUES(?,?,?)');
  AUTHORS.forEach(({followers,...a})=>ia.run(a.id,J(a),followers));
  const ib=db.prepare('INSERT INTO books(id,data,added) VALUES(?,?,?)');
  BOOKS.forEach(b=>ib.run(b.id,J(b),b.added));
  const ir=db.prepare('INSERT INTO reviews(id,book_id,user_id,user_name,rating,text,created,likes_base,insight_base) VALUES(?,?,?,?,?,?,?,?,?)');
  const ip=db.prepare('INSERT INTO review_replies(review_id,user_id,user_name,text,is_author,created) VALUES(?,?,?,?,?,?)');
  SEED_REVIEWS.forEach((r,i)=>{const t=now-(i+1)*30*H;ir.run(r.id,r.bookId,null,r.user,r.rating,r.text,t,r.likes,r.insight);r.replies.forEach(x=>ip.run(r.id,null,x.user,x.text,x.author?1:0,t+H))});
  const it=db.prepare('INSERT INTO threads(id,book_id,user_id,user_name,title,text,created) VALUES(?,?,?,?,?,?,?)');
  const ic=db.prepare('INSERT INTO comments(thread_id,parent_id,user_id,user_name,text,created) VALUES(?,?,?,?,?,?)');
  SEED_THREADS.forEach((th,i)=>{const t=now-(i+1)*20*H;it.run(th.id,th.bookId,null,th.user,th.title,th.text,t);
    th.comments.forEach(c=>{const id=ic.run(th.id,null,null,c.user,c.text,t+H).lastInsertRowid;c.replies.forEach(x=>ic.run(th.id,id,null,x.user,x.text,t+2*H))})});
  const iq=db.prepare('INSERT INTO quotes(id,book_id,text,likes_base) VALUES(?,?,?,?)');
  SEED_QUOTES.forEach(q=>iq.run(q.id,q.bookId,q.text,q.likes));
  db.prepare('INSERT INTO meta VALUES(?,?)').run('collections',J(COLLECTIONS));
  db.prepare('INSERT INTO meta VALUES(?,?)').run('weekly',J(WEEKLY));
  db.exec('COMMIT');
}
seed();
