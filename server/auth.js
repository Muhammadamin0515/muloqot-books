import {createHmac,timingSafeEqual} from 'node:crypto';

const MAX_AGE=48*3600;
/** Validates Telegram WebApp initData. Returns the Telegram user object or null. */
export function verifyInitData(initData,token){
  try{
    const p=new URLSearchParams(initData);const hash=p.get('hash');if(!hash)return null;p.delete('hash');
    const str=[...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n');
    const secret=createHmac('sha256','WebAppData').update(token).digest();
    const calc=createHmac('sha256',secret).update(str).digest('hex');
    const a=Buffer.from(calc),b=Buffer.from(hash);
    if(a.length!==b.length||!timingSafeEqual(a,b))return null;
    if(Date.now()/1000-Number(p.get('auth_date')||0)>MAX_AGE)return null;
    return JSON.parse(p.get('user')||'null');
  }catch{return null}
}
