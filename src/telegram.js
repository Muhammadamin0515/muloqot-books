/* Telegram Mini App bridge. Every call is a safe no-op outside Telegram (plain browser). */
const w=typeof window!=='undefined'?window.Telegram?.WebApp:undefined;
const inTg=!!(w&&w.initData!==undefined&&w.platform&&w.platform!=='unknown');
const BG={dark:'#0c0a09',light:'#f5f2ec',paper:'#eee2c6'};
let backCb=null;

if(inTg){
  try{w.ready();w.expand();}catch(e){}
  try{w.disableVerticalSwipes?.();}catch(e){}
  try{w.enableClosingConfirmation?.();}catch(e){}
  document.documentElement.classList.add('in-tg');
  const applyInsets=()=>{
    const r=document.documentElement.style;
    const s=w.safeAreaInset||{},c=w.contentSafeAreaInset||{};
    r.setProperty('--tg-top',((s.top||0)+(c.top||0))+'px');
    r.setProperty('--tg-bottom',((s.bottom||0)+(c.bottom||0))+'px');
  };
  applyInsets();
  w.onEvent?.('safeAreaChanged',applyInsets);
  w.onEvent?.('contentSafeAreaChanged',applyInsets);
  w.BackButton?.onClick(()=>backCb&&backCb());
}

export const isTelegram=()=>inTg;
export const user=()=>inTg?w.initDataUnsafe?.user||null:null;
export const langCode=()=>(user()?.language_code||'').slice(0,2);
export const onBack=fn=>{backCb=fn};

export function sync({canBack,theme}){
  if(!inTg)return;
  try{canBack?w.BackButton.show():w.BackButton.hide()}catch(e){}
  const c=BG[theme]||BG.dark;
  try{w.setHeaderColor?.(c);w.setBackgroundColor?.(c);w.setBottomBarColor?.(c)}catch(e){}
}
export function tap(){if(inTg)try{w.HapticFeedback?.selectionChanged()}catch(e){}}
export function notify(type='success'){if(inTg)try{w.HapticFeedback?.notificationOccurred(type)}catch(e){}}
/* Opens Telegram's share sheet. `link` is a deep link (t.me/bot/app?startapp=...) so the recipient lands on the same book. */
export function share(text,link){
  if(!inTg)return false;
  const u='https://t.me/share/url?url='+encodeURIComponent(link||' ')+'&text='+encodeURIComponent(text);
  try{w.openTelegramLink(u);return true}catch(e){return false}
}
export const startParam=()=>inTg?(w.initDataUnsafe&&w.initDataUnsafe.start_param)||'':'';
export const initData=()=>inTg?w.initData||'':'';
/* Telegram Stars checkout. Returns false outside Telegram (or on very old clients). */
export function openInvoice(link,cb){if(!inTg||!w.openInvoice)return false;try{w.openInvoice(link,cb);return true}catch(e){return false}}
export function openLink(url){if(inTg&&w.openLink){try{w.openLink(url);return}catch(e){}}window.open(url,'_blank','noopener')}
export const close=()=>{if(inTg)try{w.close()}catch(e){}};
/* Rich "share a prepared card" flow (Mini Apps 8.0+). Returns false when the client cannot do it, so callers can fall back to a plain link. */
export const canShareMessage=()=>!!(inTg&&w.shareMessage&&(!w.isVersionAtLeast||w.isVersionAtLeast('8.0')));
export function shareMessage(id,cb){if(!canShareMessage())return false;try{w.shareMessage(id,cb);return true}catch(e){return false}}
