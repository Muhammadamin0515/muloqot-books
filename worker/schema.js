/** Schema additions applied lazily at runtime, so deploys never need manual SQL. Safe to run repeatedly. */
const DDL=[
  'CREATE TABLE IF NOT EXISTS admins(user_id TEXT PRIMARY KEY,added_by TEXT,created INTEGER)',
  'CREATE TABLE IF NOT EXISTS support_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,from_admin INTEGER DEFAULT 0,text TEXT,created INTEGER,read INTEGER DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_id)',
  'CREATE TABLE IF NOT EXISTS donations(id TEXT PRIMARY KEY,user_id TEXT,user_name TEXT,amount INTEGER,source TEXT DEFAULT \'stars\',goal_id TEXT,anon INTEGER DEFAULT 0,message TEXT,status TEXT,charge_id TEXT,note TEXT,created INTEGER,paid_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_don_status ON donations(status,paid_at)',
  'CREATE TABLE IF NOT EXISTS goals(id TEXT PRIMARY KEY,title_ru TEXT,title_uz TEXT,desc_ru TEXT,desc_uz TEXT,target INTEGER,active INTEGER DEFAULT 1,created INTEGER)',
  'CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT,target TEXT,user_id TEXT,reason TEXT,created INTEGER,status TEXT DEFAULT \'open\')',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_uniq ON reports(kind,target,user_id)',
  'CREATE TABLE IF NOT EXISTS actions(user_id TEXT,ts INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_actions_user ON actions(user_id,ts)',
  'CREATE TABLE IF NOT EXISTS book_stats(book_id TEXT,day TEXT,views INTEGER DEFAULT 0,reads INTEGER DEFAULT 0,finishes INTEGER DEFAULT 0,PRIMARY KEY(book_id,day))',
  'CREATE TABLE IF NOT EXISTS book_seen(user_id TEXT,book_id TEXT,day TEXT,type TEXT,PRIMARY KEY(user_id,book_id,day,type))',
  'CREATE TABLE IF NOT EXISTS book_versions(id INTEGER PRIMARY KEY AUTOINCREMENT,book_id TEXT,created INTEGER,data TEXT)',
  'CREATE INDEX IF NOT EXISTS idx_versions_book ON book_versions(book_id)',
  'CREATE TABLE IF NOT EXISTS achievements(user_id TEXT,key TEXT,ts INTEGER,seen INTEGER DEFAULT 0,PRIMARY KEY(user_id,key))',
  'CREATE TABLE IF NOT EXISTS audio_tracks(id INTEGER PRIMARY KEY AUTOINCREMENT,book_id TEXT,idx INTEGER,title TEXT,url TEXT,duration INTEGER DEFAULT 0,created INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_audio_book ON audio_tracks(book_id,idx)',
  'CREATE TABLE IF NOT EXISTS book_retellings(book_id TEXT,lang TEXT,text TEXT,status TEXT,summaries TEXT,progress INTEGER DEFAULT 0,total INTEGER DEFAULT 0,model TEXT,created INTEGER,updated INTEGER,PRIMARY KEY(book_id,lang))',
  'CREATE TABLE IF NOT EXISTS lit_files(book_id TEXT,version TEXT,hash TEXT,chapters INTEGER,chunks INTEGER,chars INTEGER,bytes INTEGER,format TEXT,storage TEXT,toc TEXT,prep_version TEXT,ready INTEGER DEFAULT 0,created INTEGER,PRIMARY KEY(book_id,version))',
  'CREATE TABLE IF NOT EXISTS book_chunks(book_id TEXT,version TEXT,ch INTEGER,seq INTEGER,body TEXT,PRIMARY KEY(book_id,version,ch,seq))',
  'CREATE TABLE IF NOT EXISTS reading_progress(user_id TEXT,book_id TEXT,ver TEXT,locator TEXT,percent REAL,rev INTEGER,updated INTEGER,PRIMARY KEY(user_id,book_id))',
  'CREATE TABLE IF NOT EXISTS bookmarks(user_id TEXT,id TEXT,book_id TEXT,ver TEXT,ch INTEGER,para INTEGER,snippet TEXT,created INTEGER,PRIMARY KEY(user_id,id))',
  'CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id,created)',
  'CREATE TABLE IF NOT EXISTS survey_votes(broadcast_id TEXT,user_id TEXT,opt INTEGER,ts INTEGER,PRIMARY KEY(broadcast_id,user_id))',
  'CREATE TABLE IF NOT EXISTS broadcast_media(id TEXT PRIMARY KEY,mime TEXT,data TEXT,created INTEGER)',
  'CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,ts INTEGER,user_id TEXT,action TEXT,target TEXT,detail TEXT)',
  'CREATE TABLE IF NOT EXISTS broadcasts(id TEXT PRIMARY KEY,text TEXT,audience TEXT,status TEXT,total INTEGER DEFAULT 0,sent INTEGER DEFAULT 0,failed INTEGER DEFAULT 0,cursor TEXT DEFAULT \'\',created INTEGER,created_by TEXT)',
  'CREATE TABLE IF NOT EXISTS support_chats(id TEXT PRIMARY KEY,user_id TEXT,title TEXT,created INTEGER,updated INTEGER,hidden_user INTEGER DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS idx_support_chats_user ON support_chats(user_id,updated)',
  'CREATE TABLE IF NOT EXISTS ai_jobs(id TEXT PRIMARY KEY,created INTEGER,updated INTEGER,created_by TEXT,status TEXT,pause_reason TEXT DEFAULT \'\',title TEXT,config TEXT,plan TEXT,state TEXT,calls INTEGER DEFAULT 0,tokens_in INTEGER DEFAULT 0,tokens_out INTEGER DEFAULT 0,cost REAL DEFAULT 0,cost_unknown INTEGER DEFAULT 0,lock_until INTEGER DEFAULT 0,book_id TEXT)',
  'CREATE TABLE IF NOT EXISTS ai_chapters(job_id TEXT,idx INTEGER,status TEXT,text TEXT DEFAULT \'\',summary TEXT DEFAULT \'\',facts TEXT DEFAULT \'[]\',updated INTEGER,PRIMARY KEY(job_id,idx))',
  'CREATE TABLE IF NOT EXISTS ai_versions(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT,chapter INTEGER,kind TEXT,text TEXT,provider TEXT,model TEXT,note TEXT DEFAULT \'\',created INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_ai_versions ON ai_versions(job_id,chapter)',
  'CREATE TABLE IF NOT EXISTS ai_checks(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT,chapter INTEGER,kind TEXT,ok INTEGER,issues TEXT,provider TEXT,model TEXT,created INTEGER)',
  'CREATE TABLE IF NOT EXISTS ai_calls(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT,chapter INTEGER,task TEXT,provider TEXT,model TEXT,via TEXT,latency INTEGER,tokens_in INTEGER,tokens_out INTEGER,estimated INTEGER DEFAULT 0,cost REAL,status TEXT,error TEXT DEFAULT \'\',created INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_ai_calls ON ai_calls(job_id,id)'
];
const ALTERS=[
  'ALTER TABLE ai_jobs ADD COLUMN workflow_id TEXT',
  "ALTER TABLE ai_jobs ADD COLUMN workflow_status TEXT DEFAULT ''",
  'ALTER TABLE support_messages ADD COLUMN chat_id TEXT',
  'ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_seen INTEGER',
  'ALTER TABLE books ADD COLUMN hidden INTEGER DEFAULT 0',
  'ALTER TABLE reviews ADD COLUMN hidden INTEGER DEFAULT 0',
  'ALTER TABLE threads ADD COLUMN hidden INTEGER DEFAULT 0',
  'ALTER TABLE comments ADD COLUMN hidden INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN reminded TEXT',
  'ALTER TABLE submissions ADD COLUMN update_book_id TEXT',
  'ALTER TABLE submissions ADD COLUMN style INTEGER',
  'ALTER TABLE reviews ADD COLUMN demo INTEGER',
  'ALTER TABLE broadcasts ADD COLUMN kind TEXT',
  'ALTER TABLE broadcasts ADD COLUMN photo TEXT',
  'ALTER TABLE broadcasts ADD COLUMN button TEXT',
  'ALTER TABLE broadcasts ADD COLUMN options TEXT',
  'ALTER TABLE broadcasts ADD COLUMN lang TEXT',
  'ALTER TABLE threads ADD COLUMN demo INTEGER',
  'ALTER TABLE quotes ADD COLUMN demo INTEGER'
];
/* Test data shipped in migrations/0002_seed.sql has short ids (b1, a1, r1, t1, q1); everything created later has 8+ characters.
   Mark the seed rows once, so real and demo content can be separated without deleting anything. Idempotent. */
const BACKFILL=[
  'CREATE INDEX IF NOT EXISTS idx_support_chat ON support_messages(chat_id,id)',
  /* conversations: every user's earlier support messages become one first chat */
  "INSERT OR IGNORE INTO support_chats(id,user_id,title,created,updated) SELECT 'd'||user_id,user_id,'Первое обращение',MIN(created),MAX(created) FROM support_messages WHERE chat_id IS NULL AND user_id IS NOT NULL GROUP BY user_id",
  "UPDATE support_messages SET chat_id='d'||user_id WHERE chat_id IS NULL AND user_id IS NOT NULL",
  /* books made with the AI tool belong to the platform's own shelf */
  "UPDATE books SET data=json_set(data,'$.own',1) WHERE json_extract(data,'$.ai') IS NOT NULL AND json_extract(data,'$.own') IS NULL",
  /* covers drawn by the app itself (imported and AI books) are drawn in the browser, not downloaded: one request less per book */
  "UPDATE books SET data=json_set(data,'$.imgAuto',1) WHERE json_extract(data,'$.img') IS NOT NULL AND json_extract(data,'$.imgAuto') IS NULL AND (json_extract(data,'$.lit.sourceId') IS NOT NULL OR json_extract(data,'$.ai') IS NOT NULL)",
  "UPDATE books SET data=json_set(data,'$.demo',1) WHERE length(id)<=3 AND json_extract(data,'$.demo') IS NULL",
  "UPDATE authors SET data=json_set(data,'$.demo',1) WHERE length(id)<=3 AND json_extract(data,'$.demo') IS NULL",
  'UPDATE reviews SET demo=CASE WHEN length(id)<=3 THEN 1 ELSE 0 END WHERE demo IS NULL',
  'UPDATE threads SET demo=CASE WHEN length(id)<=3 THEN 1 ELSE 0 END WHERE demo IS NULL',
  'UPDATE quotes SET demo=CASE WHEN length(id)<=3 THEN 1 ELSE 0 END WHERE demo IS NULL'
];
let ready;
export const ensureSchema=env=>ready||(ready=(async()=>{
  for(const s of DDL)await env.DB.prepare(s).run();
  for(const s of ALTERS)try{await env.DB.prepare(s).run()}catch(e){if(!/duplicate column/i.test(String(e.message||e)))throw e}
  for(const s of BACKFILL)await env.DB.prepare(s).run();
})().catch(e=>{ready=null;throw e}));
