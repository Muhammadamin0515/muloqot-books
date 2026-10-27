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
  'CREATE TABLE IF NOT EXISTS broadcasts(id TEXT PRIMARY KEY,text TEXT,audience TEXT,status TEXT,total INTEGER DEFAULT 0,sent INTEGER DEFAULT 0,failed INTEGER DEFAULT 0,cursor TEXT DEFAULT \'\',created INTEGER,created_by TEXT)'
];
const ALTERS=[
  'ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_seen INTEGER',
  'ALTER TABLE books ADD COLUMN hidden INTEGER DEFAULT 0',
  'ALTER TABLE reviews ADD COLUMN hidden INTEGER DEFAULT 0',
  'ALTER TABLE threads ADD COLUMN hidden INTEGER DEFAULT 0',
  'ALTER TABLE comments ADD COLUMN hidden INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN reminded TEXT'
];
let ready;
export const ensureSchema=env=>ready||(ready=(async()=>{
  for(const s of DDL)await env.DB.prepare(s).run();
  for(const s of ALTERS)try{await env.DB.prepare(s).run()}catch(e){if(!/duplicate column/i.test(String(e.message||e)))throw e}
})().catch(e=>{ready=null;throw e}));
