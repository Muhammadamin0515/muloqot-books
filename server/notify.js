const token=()=>process.env.BOT_TOKEN;
export async function tgApi(method,body){
  if(!token())return null;
  try{const r=await fetch(`https://api.telegram.org/bot${token()}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return await r.json()}catch{return null}
}
/** Sends a bot message to a Telegram user (their id is the private chat id). No-op without BOT_TOKEN or for dev users. */
export function notify(userId,text){
  if(!token()||!/^\d+$/.test(String(userId||'')))return;
  const url=process.env.WEBAPP_URL;
  tgApi('sendMessage',{chat_id:userId,text,...(url?{reply_markup:{inline_keyboard:[[{text:'Открыть Muloqot Books',web_app:{url}}]]}}:{})});
}
