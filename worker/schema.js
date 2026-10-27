/** Schema additions applied lazily at runtime, so deploys never need manual SQL. Safe to run repeatedly. */
const DDL=[
  'CREATE TABLE IF NOT EXISTS admins(user_id TEXT PRIMARY KEY,added_by TEXT,created INTEGER)',
  'CREATE TABLE IF NOT EXISTS support_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,from_admin INTEGER DEFAULT 0,text TEXT,created INTEGER,read INTEGER DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_id)',
  'CREATE TABLE IF NOT EXISTS broadcasts(id TEXT PRIMARY KEY,text TEXT,audience TEXT,status TEXT,total INTEGER DEFAULT 0,sent INTEGER DEFAULT 0,failed INTEGER DEFAULT 0,cursor TEXT DEFAULT \'\',created INTEGER,created_by TEXT)'
];
const ALTERS=[
  'ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_seen INTEGER',
  'ALTER TABLE books ADD COLUMN hidden INTEGER DEFAULT 0'
];
let ready;
export const ensureSchema=env=>ready||(ready=(async()=>{
  for(const s of DDL)await env.DB.prepare(s).run();
  for(const s of ALTERS)try{await env.DB.prepare(s).run()}catch(e){if(!/duplicate column/i.test(String(e.message||e)))throw e}
})().catch(e=>{ready=null;throw e}));
