/* Audiobook player. Tracks are real files attached by an administrator (Admin → Content → book → Audio); a book without tracks shows no player.
   Playback position (track and second) is stored per book in the reader's synced state. */
import {cover,authorOf} from './art.js';

const SPEEDS=[0.75,1,1.25,1.5,1.75,2];
const fmt=s=>{s=Math.max(0,Math.floor(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(r).padStart(2,'0')};

export function initAudio(x){
  const {SCREENS,ACT,go,api,toast,esc,ico,tr,refresh,NAV,book,save}=x;
  const S=()=>x.S;
  const A={id:null,tracks:null,i:0,playing:false,cur:0,dur:0,speed:1,err:false,loading:false};
  const el=new Audio();el.preload='metadata';
  let lastSave=0;

  const pos=()=>{const s=S();s.audioPos=s.audioPos||{};return s.audioPos};
  const savePos=(force)=>{if(!A.id)return;const now=Date.now();if(!force&&now-lastSave<5000)return;lastSave=now;pos()[A.id]={track:A.i,t:Math.floor(el.currentTime||0),speed:A.speed,ts:now};save()};
  const onAudio=()=>NAV.cur.name==='audio';
  const ui=(id,v)=>{const n=document.getElementById(id);if(n)n.textContent=v};

  el.addEventListener('timeupdate',()=>{A.cur=el.currentTime;const r=document.getElementById('aSeek');if(r&&!r.matches(':active')){r.max=Math.floor(A.dur||0);r.value=Math.floor(A.cur)}ui('aCur',fmt(A.cur));ui('aLeft','-'+fmt(Math.max(0,A.dur-A.cur)));savePos(false)});
  el.addEventListener('loadedmetadata',()=>{A.dur=el.duration||0;A.err=false;const r=document.getElementById('aSeek');if(r)r.max=Math.floor(A.dur);ui('aLeft','-'+fmt(A.dur-A.cur))});
  el.addEventListener('play',()=>{A.playing=true;setBtn();if(x.podPause)x.podPause()});
  el.addEventListener('pause',()=>{A.playing=false;setBtn();savePos(true)});
  el.addEventListener('error',()=>{A.err=true;A.playing=false;if(onAudio())refresh()});
  el.addEventListener('ended',()=>{if(A.tracks&&A.i<A.tracks.length-1)load(A.i+1,0,true);else{A.playing=false;savePos(true);setBtn()}});
  const setBtn=()=>{const b=document.getElementById('aPlay');if(b)b.innerHTML=ico(A.playing?'pause':'play',30)};

  function mediaSession(){
    if(!('mediaSession' in navigator)||!A.id)return;const b=book(A.id);if(!b)return;
    try{navigator.mediaSession.metadata=new MediaMetadata({title:A.tracks[A.i].title,artist:authorOf(b).name,album:b.title});
      navigator.mediaSession.setActionHandler('play',()=>el.play());navigator.mediaSession.setActionHandler('pause',()=>el.pause());
      navigator.mediaSession.setActionHandler('seekbackward',()=>skip(-15));navigator.mediaSession.setActionHandler('seekforward',()=>skip(30));
      navigator.mediaSession.setActionHandler('previoustrack',()=>load(Math.max(0,A.i-1),0,true));navigator.mediaSession.setActionHandler('nexttrack',()=>load(Math.min(A.tracks.length-1,A.i+1),0,true))}catch(e){}
  }
  function load(i,t,play){
    A.i=i;A.cur=t||0;A.dur=A.tracks[i].duration||0;A.err=false;el.src=A.tracks[i].url;el.playbackRate=A.speed;
    el.addEventListener('loadedmetadata',function f(){el.removeEventListener('loadedmetadata',f);if(t)el.currentTime=t},{once:true});
    if(play)el.play().catch(()=>{A.err=true;if(onAudio())refresh()});
    mediaSession();if(onAudio())refresh();
  }
  const skip=d=>{el.currentTime=Math.max(0,Math.min(el.duration||1e9,el.currentTime+d))};

  ACT.audioOpen=async b=>{
    const id=b.dataset.id;
    if(A.id!==id){el.pause();A.id=id;A.tracks=null;A.err=false;A.loading=true;go('audio',{id});
      try{const r=await api(`/api/books/${id}/audio`);A.tracks=r.tracks;
        const p=pos()[id];A.speed=p&&p.speed||1;
        if(A.tracks.length){const i=p&&p.track<A.tracks.length?p.track:0;A.i=i;A.cur=p?p.t:0;A.dur=A.tracks[i].duration||0;el.src=A.tracks[i].url;el.playbackRate=A.speed;
          if(p&&p.t)el.addEventListener('loadedmetadata',()=>{el.currentTime=p.t},{once:true});mediaSession()}
      }catch(e){A.tracks=[];A.err=true;toast(e&&e.detail==='rights'?tr('Аудио недоступно','Audio mavjud emas'):tr('Не удалось загрузить аудио','Audioni yuklab bo‘lmadi'))}
      A.loading=false;if(onAudio())refresh();
    }else go('audio',{id});
  };
  ACT.aToggle=()=>{if(!A.tracks||!A.tracks.length)return;if(el.paused){A.err=false;el.play().catch(()=>{A.err=true;refresh()})}else el.pause()};
  ACT.aSkip=b=>skip(+b.dataset.d);
  ACT.aTrack=b=>load(+b.dataset.i,0,true);
  ACT.aPrev=()=>{if(el.currentTime>5)skip(-el.currentTime);else if(A.i>0)load(A.i-1,0,A.playing)};
  ACT.aNext=()=>{if(A.i<A.tracks.length-1)load(A.i+1,0,A.playing)};
  ACT.aSpeed=()=>{const k=(SPEEDS.indexOf(A.speed)+1)%SPEEDS.length;A.speed=SPEEDS[k];el.playbackRate=A.speed;ui('aSpd',A.speed+'×');savePos(true)};
  document.addEventListener('input',e=>{if(e.target&&e.target.id==='aSeek'){el.currentTime=+e.target.value;ui('aCur',fmt(+e.target.value))}});
  window.addEventListener('pagehide',()=>savePos(true));

  SCREENS.audio=({id})=>{
    const b=book(id);if(!b)return '';
    const head=`<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="${tr('Назад','Orqaga')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">${tr('Аудиокнига','Audiokitob')}</h2></div></header>`;
    if(A.loading||A.tracks===null)return head+`<div class="px"><div class="sk" style="height:260px;border-radius:20px"></div></div>`;
    if(!A.tracks.length)return head+`<div class="px">${x.empty('headphones',tr('Аудио пока нет','Audio hozircha yo‘q'),tr('Для этой книги ещё не добавлены аудиофайлы.','Bu kitob uchun hali audio fayllar qo‘shilmagan.'))}</div>`;
    const t=A.tracks[A.i];
    return `${head}<div class="px aud"><div class="aud-cv">${cover(b)}</div><h1 class="display" style="font-size:22px;margin-top:18px">${esc(b.title)}</h1><div class="mute" style="font-size:13.5px">${esc(authorOf(b).name)}</div>
      <div class="aud-t">${esc(t.title)}</div>
      ${A.err?`<p class="err" style="text-align:center">${tr('Не удалось загрузить аудио. Проверьте соединение.','Audioni yuklab bo‘lmadi. Aloqani tekshiring.')}</p>`:''}
      <input id="aSeek" class="aud-seek" type="range" min="0" max="${Math.floor(A.dur||0)}" value="${Math.floor(A.cur)}" aria-label="${tr('Позиция','Joylashuv')}">
      <div class="aud-time mono"><span id="aCur">${fmt(A.cur)}</span><span id="aLeft">-${fmt(Math.max(0,A.dur-A.cur))}</span></div>
      <div class="aud-ctl"><button class="iconbtn" data-a="aPrev" aria-label="${tr('Назад','Orqaga')}">${ico('prev',24)}</button><button class="iconbtn" data-a="aSkip" data-d="-15" aria-label="-15">${ico('back15',26)}</button>
        <button id="aPlay" class="aud-play" data-a="aToggle" aria-label="${tr('Играть/пауза','Ijro/pauza')}">${ico(A.playing?'pause':'play',30)}</button>
        <button class="iconbtn" data-a="aSkip" data-d="30" aria-label="+30">${ico('fwd30',26)}</button><button class="iconbtn" data-a="aNext" aria-label="${tr('Вперёд','Oldinga')}" ${A.i>=A.tracks.length-1?'disabled':''}>${ico('next',24)}</button></div>
      <div class="row" style="justify-content:center;margin-top:6px"><button class="chip" data-a="aSpeed" aria-label="${tr('Скорость','Tezlik')}"><span id="aSpd">${A.speed}×</span></button></div>
      ${A.tracks.length>1?`<div class="list" style="margin-top:22px">${A.tracks.map((x2,i)=>`<button class="li ${i===A.i?'on':''}" data-a="aTrack" data-i="${i}"><span class="grow" style="text-align:left">${i+1}. ${esc(x2.title)}</span><span class="mono mute">${x2.duration?fmt(x2.duration):''}</span></button>`).join('')}</div>`:''}</div>`;
  };
  x.audioPause=()=>el.pause();
  x.audioState=A;
}
