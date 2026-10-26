import {AUTHORS} from './data.js';
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const IC={
 home:'<path d="M3.5 11.5 12 4l8.5 7.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
 grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
 lib:'<path d="M4 4h4v16H4zM9.5 4h4v16h-4z"/><path d="m15.2 5.4 3.8-1 2.6 14.6-3.8 1z"/>',
 chat:'<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z"/>',
 user:'<circle cx="12" cy="8.5" r="3.7"/><path d="M4.5 20c.8-3.6 3.7-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
 back:'<path d="M15 5l-7 7 7 7"/>',chev:'<path d="M9 5l7 7-7 7"/>',arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 star:'<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8 6.9 19.5l1-5.7-4.1-4 5.7-.8z"/>',
 heart:'<path d="M12 20s-7-4.4-9-9.1C1.8 7.6 4 4.5 7.2 4.6c2 .1 3.4 1.2 4.8 3 1.4-1.8 2.8-2.9 4.8-3 3.2-.1 5.4 3 4.2 6.3C19 15.6 12 20 12 20z"/>',
 bookmark:'<path d="M6.5 3.5h11v17.2L12 16.6l-5.5 4.1z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
 list:'<path d="M4 6h16M4 12h16M4 18h10"/>',
 text:'<path d="M3 19 8 6l5 13M4.8 14.5h6.4"/><path d="M15 19l3-8 3 8M16 16.5h4"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 share:'<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
 send:'<path d="M20 4 10 14M20 4l-6 16-4-6-6-4z"/>',
 reply:'<path d="M10 8 4 13l6 5M4 13h9a7 7 0 0 1 7 7"/>',
 upload:'<path d="M12 16V5M8 9l4-4 4 4"/><path d="M5 15v4h14v-4"/>',
 bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4"/>',
 pen:'<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
 file:'<path d="M7 3h7l4 4v14H7zM14 3v4h4"/>',
 trash:'<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
 quote:'<path d="M7 17c-1.7 0-3-1.2-3-3 0-3.5 2-6 5-7M16 17c-1.7 0-3-1.2-3-3 0-3.5 2-6 5-7"/>',
 spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 flame:'<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2 0-3-1-5 1-8z"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
};
export const ico=(n,s=22,cls='')=>`<svg class="ico ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;

export function rng(seed){let s=0;for(const c of String(seed))s=(s*31+c.charCodeAt(0))>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
export function wrapT(t,max){const w=t.split(' ');const out=[];let cur='';for(const x of w){if(cur&&(cur+' '+x).length>max){out.push(cur);cur=x}else cur=cur?cur+' '+x:x}if(cur)out.push(cur);return out}
export const authorOf=b=>AUTHORS.find(a=>a.id===b.a)||{name:b.authorName||''};

/* --- cover motifs: p = [top, bottom, accent, dark, light] on a 300x450 plate --- */
export const MOTIF={
 window(p,r,id){let sky='';let x=70;while(x<226){const w=14+r()*22,h=30+r()*70;sky+=`<rect x="${x.toFixed(0)}" y="${(300-h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${p[3]}"/>`;if(r()>.45)sky+=`<rect x="${(x+4).toFixed(0)}" y="${(300-h+8+r()*20).toFixed(0)}" width="4" height="5" fill="${p[2]}"/>`;x+=w+2}
  return `<rect x="62" y="70" width="176" height="250" fill="${p[3]}"/><rect x="70" y="78" width="160" height="234" fill="url(#w${id})"/><circle cx="196" cy="128" r="26" fill="${p[4]}" opacity=".92"/>${sky}<path d="M150 78v234M70 188h160" stroke="${p[3]}" stroke-width="5"/><rect x="54" y="320" width="192" height="10" fill="${p[3]}"/>
  <defs><linearGradient id="w${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[2]}"/></linearGradient></defs>`},
 tree(p,r){let lv='';for(let i=0;i<46;i++){const a=r()*6.28,d=Math.sqrt(r())*118;lv+=`<circle cx="${(150+Math.cos(a)*d).toFixed(0)}" cy="${(200+Math.sin(a)*d).toFixed(0)}" r="${(1.6+r()*3.4).toFixed(1)}" fill="${r()>.5?p[4]:p[2]}" opacity="${(.5+r()*.5).toFixed(2)}"/>`}
  return `<circle cx="150" cy="196" r="96" fill="${p[2]}" opacity=".9"/>${lv}<path d="M150 380C150 320 142 270 150 214 158 270 150 320 150 380z" fill="${p[3]}"/><path d="M150 262C128 250 112 238 98 214M150 246c26-12 42-26 54-54M150 220c-6-20-8-40-14-62M150 290c-16-4-28-10-40-22" stroke="${p[3]}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M0 372Q150 346 300 376V450H0z" fill="${p[3]}"/>`},
 train(p){let s='';for(let i=1;i<=14;i++){const t=Math.pow(i/14,1.7);const y=232+t*218,w=4+t*118;s+=`<line x1="${150-w}" y1="${y.toFixed(1)}" x2="${150+w}" y2="${y.toFixed(1)}" stroke="${p[4]}" stroke-opacity=".5" stroke-width="${(1+t*2.5).toFixed(1)}"/>`}
  return `<circle cx="150" cy="214" r="62" fill="${p[2]}"/><rect y="232" width="300" height="218" fill="${p[3]}"/>${s}<path d="M42 450 146 232M258 450 154 232" stroke="${p[4]}" stroke-width="3.4" fill="none"/><g stroke="${p[3]}" stroke-width="3"><path d="M52 232v-26M70 232v-18M232 232v-18M250 232v-26"/></g>`},
 caravan(p,r){let f='';for(let i=0;i<6;i++){const x=48+i*38,y=290-Math.sin(i*.6)*10;f+=`<g fill="${p[3]}"><circle cx="${x}" cy="${(y-14).toFixed(0)}" r="2.6"/><path d="M${x-3} ${(y-10).toFixed(0)}h6l2 12h-10z"/></g>`}
  return `<circle cx="150" cy="262" r="76" fill="${p[2]}"/><path d="M0 300Q80 252 160 292T300 272V450H0z" fill="${p[3]}" opacity=".55"/>${f}<path d="M0 346Q100 310 200 348T300 330V450H0z" fill="${p[3]}" opacity=".85"/><path d="M0 396Q120 368 300 398V450H0z" fill="${p[3]}"/>`},
 books(p,r){const cols=[p[2],p[4],'#3a7e7a','#8a3a2a',p[2],'#c9b58d'];let s='';let y=346;for(let i=0;i<10;i++){const w=96+r()*92,h=15+r()*9,x=150-w/2+(r()-.5)*26;s+=`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${cols[Math.floor(r()*cols.length)]}"/><rect x="${x.toFixed(0)}" y="${(y+h-3).toFixed(0)}" width="${w.toFixed(0)}" height="3" fill="${p[3]}" opacity=".35"/>`;y-=h+1}
  return `<circle cx="150" cy="186" r="92" fill="${p[2]}" opacity=".88"/>${s}<g fill="${p[3]}"><circle cx="150" cy="${(y-8).toFixed(0)}" r="5"/><path d="M144 ${(y-2).toFixed(0)}h12l2 16h-16z"/></g>`},
 tea(p){let d='';for(let i=0;i<9;i++)d+=`<path d="M${92+i*14.5} 276l7 7-7 7-7-7z" fill="${p[4]}"/>`;
  return `<circle cx="150" cy="240" r="120" fill="none" stroke="${p[4]}" stroke-opacity=".22"/><circle cx="150" cy="240" r="96" fill="none" stroke="${p[4]}" stroke-opacity=".14"/><path d="M80 250h140c0 62-30 96-70 96s-70-34-70-96z" fill="${p[2]}"/><ellipse cx="150" cy="250" rx="70" ry="9" fill="${p[3]}" opacity=".45"/>${d}<rect x="116" y="344" width="68" height="9" rx="2" fill="${p[2]}"/><g stroke="${p[4]}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".75"><path d="M130 232c-10-18 10-26 0-46M152 230c-10-22 10-34 0-62M174 232c-10-18 10-26 0-46"/></g>`},
 river(p){let w='';for(let i=0;i<9;i++){const y=262+i*17;w+=`<path d="M${-20+(i%2)*25} ${y}q25-9 50 0t50 0t50 0t50 0t50 0t50 0t50 0" stroke="${p[4]}" stroke-opacity="${(.7-i*.06).toFixed(2)}" stroke-width="2" fill="none"/>`}
  return `<circle cx="150" cy="170" r="64" fill="${p[2]}"/><rect y="240" width="300" height="210" fill="${p[3]}" opacity=".7"/>${w}<path d="M118 268h64l-14 15h-36z" fill="${p[3]}"/><path d="M150 268V206" stroke="${p[3]}" stroke-width="3"/><path d="M153 208l24 54h-24z" fill="${p[4]}"/>`},
 door(p,r,id){return `<defs><linearGradient id="d${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[2]}"/></linearGradient></defs><path d="M40 420 L96 360H204L260 420z" fill="${p[2]}" opacity=".28"/><path d="M80 360V196a70 70 0 0 1 140 0V360z" fill="${p[3]}"/><path d="M96 360V198a54 54 0 0 1 108 0V360z" fill="url(#d${id})"/><path d="M96 360V198a54 54 0 0 1 36-51l-4 213z" fill="${p[3]}" opacity=".85"/><g fill="${p[3]}"><circle cx="170" cy="304" r="6"/><path d="M163 312h14l3 40h-20z"/></g><rect x="70" y="360" width="160" height="8" fill="${p[3]}"/>`},
 mount(p){return `<circle cx="204" cy="150" r="42" fill="${p[2]}"/><path d="M0 330 70 190 120 262 170 150 240 280 300 220V450H0z" fill="${p[3]}" opacity=".62"/><path d="M170 150 154 180 164 176 172 186 182 174 188 182z" fill="${p[4]}" opacity=".9"/><path d="M0 384 90 270 150 330 210 252 300 340V450H0z" fill="${p[3]}" opacity=".9"/><path d="M210 252 196 274 206 270 214 278 222 268z" fill="${p[4]}" opacity=".85"/><path d="M0 420Q150 396 300 422V450H0z" fill="${p[3]}"/>`},
 bird(p){return `<circle cx="150" cy="188" r="98" fill="${p[4]}" opacity=".92"/><path d="M150 186C128 164 96 160 52 172c40 8 62 24 76 52l22-16 22 16c14-28 36-44 76-52-44-12-76-8-98 14z" fill="${p[3]}"/><path d="M144 218l-10 66 16-34 16 34-10-66z" fill="${p[3]}"/><g stroke="${p[4]}" stroke-opacity=".5"><path d="M0 330h300M0 350h300M0 370h300" stroke-width="1"/></g>`},
 clock(p){let t='';for(let i=0;i<12;i++){const a=i*Math.PI/6;t+=`<line x1="${(150+Math.sin(a)*92).toFixed(1)}" y1="${(200-Math.cos(a)*92).toFixed(1)}" x2="${(150+Math.sin(a)*(i%3?100:108)).toFixed(1)}" y2="${(200-Math.cos(a)*(i%3?100:108)).toFixed(1)}" stroke="${p[4]}" stroke-width="${i%3?1.6:3}"/>`}
  let g='';for(let i=0;i<12;i++){g+=`<rect x="-5" y="-66" width="10" height="12" fill="${p[3]}" stroke="${p[4]}" stroke-opacity=".4" transform="rotate(${i*30})"/>`}
  return `<g transform="translate(236 330)"><circle r="56" fill="${p[3]}" stroke="${p[4]}" stroke-opacity=".4"/>${g}<circle r="14" fill="${p[1]}"/></g><circle cx="150" cy="200" r="110" fill="${p[0]}" opacity=".6" stroke="${p[4]}" stroke-width="3"/><circle cx="150" cy="200" r="86" fill="none" stroke="${p[4]}" stroke-opacity=".35"/>${t}<path d="M150 200V130M150 200l36 24" stroke="${p[2]}" stroke-width="5" stroke-linecap="round"/><circle cx="150" cy="200" r="7" fill="${p[2]}"/>`},
 ornament(p){let s='';[112,86,60].forEach((r,i)=>{const q=r*1.38;s+=`<g transform="translate(150 200)" fill="none" stroke="${p[4]}" stroke-opacity="${(.7-i*.15).toFixed(2)}" stroke-width="1.5"><rect x="${-q/2}" y="${-q/2}" width="${q}" height="${q}"/><rect x="${-q/2}" y="${-q/2}" width="${q}" height="${q}" transform="rotate(45)"/></g>`});
  let d='';for(let i=0;i<8;i++){const a=i*Math.PI/4;d+=`<circle cx="${(150+Math.sin(a)*112).toFixed(1)}" cy="${(200-Math.cos(a)*112).toFixed(1)}" r="5" fill="${p[2]}"/>`}
  return `<path d="M30 450V236a120 140 0 0 1 240 0V450z" fill="${p[3]}" opacity=".4"/>${s}${d}<circle cx="150" cy="200" r="20" fill="${p[2]}"/><circle cx="150" cy="200" r="8" fill="${p[3]}"/>`}
};

export function coverSvg(b,grain){
  const p=b.pal,id=b.id,r=rng(id);
  const lines=wrapT(b.title,13),fs=lines.length<=2?30:lines.length===3?26:22,lh=fs*1.16,y0=416-(lines.length-1)*lh;
  const tx=lines.map((l,i)=>`<text x="150" y="${(y0+i*lh).toFixed(1)}" text-anchor="middle" font-family="Prata,Georgia,serif" font-size="${fs}" fill="${p[4]}">${esc(l)}</text>`).join('');
  const an=(b.authorName||authorOf(b).name||'').toUpperCase();
  return `<svg viewBox="0 0 300 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(b.title)}">
  <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient>
  <linearGradient id="s${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".72"/></linearGradient>
  <radialGradient id="v${id}" cx=".5" cy=".42" r=".78"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient></defs>
  <rect width="300" height="450" fill="url(#g${id})"/>${(MOTIF[b.motif]||MOTIF.ornament)(p,r,id)}
  <rect width="300" height="450" fill="url(#s${id})"/><rect width="300" height="450" fill="url(#v${id})"/>
  ${grain?`<rect width="300" height="450" filter="url(#grain)" opacity=".16"/>`:''}
  <rect x="11" y="11" width="278" height="428" fill="none" stroke="${p[4]}" stroke-opacity=".22"/>
  <text x="150" y="40" text-anchor="middle" font-family="Manrope,sans-serif" font-size="10" font-weight="700" letter-spacing="2.6" fill="${p[4]}" opacity=".8">${esc(an)}</text>${tx}</svg>`;
}
export function cover(b,size){return `<div class="cover ${size||''}">${b.img?`<img src="${b.img}" alt="${esc(b.title)}">`:coverSvg(b,size!=='xs'&&size!=='sm')}</div>`}

/* --- author portraits (illustrated duotone busts) --- */
export function portraitSvg(a){
  const id='p'+a.id,[c1,c2]=a.pal;
  let hair='';
  if(a.hair==='long')hair=`<path d="M30 52c0-22 9-32 20-32s20 10 20 32c0 18 3 28 8 38H22c5-10 8-20 8-38z" fill="${a.hairc}"/>`;
  if(a.hair==='bun')hair=`<circle cx="50" cy="19" r="8" fill="${a.hairc}"/><path d="M33 46c0-18 7-26 17-26s17 8 17 26c-5-9-11-13-17-13s-12 4-17 13z" fill="${a.hairc}"/>`;
  if(a.hair==='short')hair=`<path d="M33 46c-1-17 6-27 17-27s18 10 17 27c-3-8-8-11-17-11s-14 3-17 11z" fill="${a.hairc}"/>`;
  if(a.hair==='cap')hair=`<path d="M33 40c0-12 7-18 17-18s17 6 17 18z" fill="#1a1714"/><path d="M33 38h34" stroke="#e9dcc3" stroke-width="1.4" stroke-dasharray="2 2"/>`;
  const gl=a.glasses?`<g fill="none" stroke="#1a1410" stroke-width="1.4"><circle cx="43" cy="50" r="5.2"/><circle cx="57" cy="50" r="5.2"/><path d="M48.2 50h3.6"/></g>`:'';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(a.name)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="100" height="100" fill="url(#${id})"/><circle cx="50" cy="48" r="38" fill="#fff" opacity=".06"/>
  ${a.hair==='long'?hair:''}<path d="M8 100c3-24 22-32 42-32s39 8 42 32z" fill="#17120f"/><path d="M42 62h16v12c-3 3-13 3-16 0z" fill="${a.skin}" filter="brightness(.85)"/>
  <ellipse cx="50" cy="48" rx="16" ry="19" fill="${a.skin}"/>${a.hair!=='long'?hair:`<path d="M34 44c4-9 10-13 16-13s12 4 16 13c-4-5-9-7-16-7s-12 2-16 7z" fill="${a.hairc}"/>`}${gl}
  <path d="M44 60q6 4 12 0" stroke="#7a4a35" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <rect width="100" height="100" filter="url(#grain)" opacity=".12"/></svg>`;
}
export const portrait=a=>portraitSvg(a);

/* --- onboarding scenes (original illustration, inspired by the reference mood) --- */
export function onbArt(i){
  const r=rng('onb'+i);const O='#d9531f',C='#eadfca',D='#0b0908';
  if(i===0){
    let dots='',ln='';for(let k=0;k<30;k++)dots+=`<circle cx="${(30+r()*300).toFixed(0)}" cy="${(30+r()*220).toFixed(0)}" r="${(1+r()*2.4).toFixed(1)}" fill="${r()>.5?O:C}" opacity="${(.25+r()*.5).toFixed(2)}"/>`;
    for(let k=0;k<14;k++){const x=60+k*17;ln+=`<line x1="${x}" y1="${(210+r()*30).toFixed(0)}" x2="${x}" y2="${(280+r()*40).toFixed(0)}" stroke="${O}" stroke-opacity=".35"/>`}
    return `<svg class="oa" viewBox="0 0 360 440" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="ob1" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f08a3c"/><stop offset=".6" stop-color="#d9481f"/><stop offset="1" stop-color="#d9481f" stop-opacity="0"/></radialGradient></defs>
    <rect width="360" height="440" fill="${D}"/><circle cx="180" cy="190" r="150" fill="url(#ob1)" opacity=".92"/><circle cx="180" cy="190" r="132" fill="none" stroke="${C}" stroke-opacity=".28"/><circle cx="180" cy="190" r="108" fill="none" stroke="${C}" stroke-opacity=".16"/>${ln}${dots}
    <g fill="${D}"><circle cx="180" cy="278" r="6"/><path d="M172 285h16l3 40h-22z"/></g>
    <path d="M180 332C150 316 100 316 52 332l16 56c42-14 82-12 112 8z" fill="${C}"/><path d="M180 332c30-16 80-16 128 0l-16 56c-42-14-82-12-112 8z" fill="#d9cdb4"/><path d="M180 332v64" stroke="#7a6a52" stroke-width="1.5"/><rect width="360" height="440" filter="url(#grain)" opacity=".1"/></svg>`;
  }
  if(i===1){
    let bk='';const cols=[O,'#e89b45','#d9cdb4','#8a3a2a','#3d7a77','#b9b0a0'];
    for(let k=0;k<22;k++){const a=k/22*6.283+r()*.2,rx=118+r()*40,ry=104+r()*34;const x=180+Math.cos(a)*rx,y=195+Math.sin(a)*ry,rot=(r()-.5)*110;
      bk+=`<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${rot.toFixed(0)})"><path d="M-17-10 0-7 17-10V9L0 12-17 9z" fill="${cols[Math.floor(r()*cols.length)]}"/><path d="M0-7V12" stroke="${D}" stroke-opacity=".4"/></g>`}
    return `<svg class="oa" viewBox="0 0 360 440" preserveAspectRatio="xMidYMid slice"><rect width="360" height="440" fill="${D}"/><circle cx="180" cy="195" r="112" fill="${C}" opacity=".15"/><circle cx="180" cy="195" r="112" fill="none" stroke="${C}" stroke-opacity=".3"/>${bk}
    <g fill="${D}"><circle cx="180" cy="190" r="9"/><path d="M166 202h28l6 40h-40z"/><ellipse cx="180" cy="250" rx="34" ry="8"/></g><path d="M162 236 180 232 198 236 192 246 180 243 168 246z" fill="${C}"/><rect x="140" y="256" width="80" height="6" fill="${O}"/><rect width="360" height="440" filter="url(#grain)" opacity=".1"/></svg>`;
  }
  if(i===2){
    let st='';const cols=['#2f1d17',O,'#d8c9a6','#3d7a77','#e89b45','#1c1612','#9a3b25'];let y=420;
    for(let k=0;k<12;k++){const w=330-k*20,h=17+r()*8;let x=180-w/2;let rem=w;while(rem>20){const bw=Math.min(rem,26+r()*54);st+=`<rect x="${x.toFixed(0)}" y="${y}" width="${bw.toFixed(0)}" height="${h.toFixed(0)}" fill="${cols[Math.floor(r()*cols.length)]}"/>`;x+=bw;rem-=bw}y-=h+1}
    return `<svg class="oa" viewBox="0 0 360 440" preserveAspectRatio="xMidYMid slice"><rect width="360" height="440" fill="#eadfc6"/><circle cx="180" cy="150" r="104" fill="#e3672b"/><text x="136" y="168" text-anchor="middle" font-family="Prata,serif" font-size="58" fill="${D}" opacity=".88">Аа</text><text x="228" y="168" text-anchor="middle" font-family="Prata,serif" font-size="58" fill="${D}" opacity=".88">Oʻo</text>${st}<rect width="360" height="440" filter="url(#grain)" opacity=".12"/></svg>`;
  }
  let cl='',ln='';const cols=['#2f1d17',O,'#3d7a77','#e89b45','#9a3b25','#d8c9a6','#1c1612'];const pts=[];
  for(let k=0;k<90;k++){const x=180+(r()-.5)*270,y=150+(r()-.5)*210;if(((x-180)/135)**2+((y-150)/105)**2>1)continue;pts.push([x,y]);cl+=`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(14+r()*24).toFixed(0)}" height="${(6+r()*12).toFixed(0)}" fill="${cols[Math.floor(r()*cols.length)]}"/>`}
  for(let k=0;k<12;k++){const p=pts[Math.floor(r()*pts.length)];ln+=`<path d="M${p[0].toFixed(0)} ${p[1].toFixed(0)}L180 372" stroke="#3a2a20" stroke-opacity=".35" fill="none"/>`}
  return `<svg class="oa" viewBox="0 0 360 440" preserveAspectRatio="xMidYMid slice"><rect width="360" height="440" fill="#eadfc6"/>${ln}${cl}<g fill="${D}"><circle cx="180" cy="366" r="9"/><path d="M168 378h24l4 52h-32z"/></g><rect width="360" height="440" filter="url(#grain)" opacity=".12"/></svg>`;
}
