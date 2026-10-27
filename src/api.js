import {initData} from './telegram.js';

export const net={online:false};
let devId='';
try{devId=localStorage.getItem('muloqot.dev')||('d'+Math.random().toString(36).slice(2,10));localStorage.setItem('muloqot.dev',devId)}catch(e){devId='d0'}
const BASE=import.meta.env.VITE_API_URL||'';

export async function api(path,method='GET',body){
  const h={'content-type':'application/json'};
  const tma=initData();
  if(tma)h.authorization='tma '+tma;else h['x-dev-user']=new URLSearchParams(location.search).get('as')||devId;
  const r=await fetch(BASE+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  if(!r.ok){const b=await r.json().catch(()=>({}));throw Object.assign(new Error(b.detail||'api '+r.status),{status:r.status,detail:b.detail||b.error})}
  return r.json();
}
