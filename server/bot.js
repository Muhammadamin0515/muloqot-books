import {tgApi} from './notify.js';
/** Minimal long-polling bot: /start replies with a button that opens the Mini App. */
export async function startBot(){
  const url=process.env.WEBAPP_URL;if(!process.env.BOT_TOKEN||!url)return;
  let offset=0;
  for(;;){
    const r=await tgApi('getUpdates',{offset,timeout:30,allowed_updates:['message']});
    if(!r?.ok){await new Promise(s=>setTimeout(s,5000));continue}
    for(const u of r.result){offset=u.update_id+1;const m=u.message;if(!m?.text)continue;
      if(m.text.startsWith('/start'))await tgApi('sendMessage',{chat_id:m.chat.id,text:'Muloqot Books — русская и узбекская литература. Откройте приложение:',reply_markup:{inline_keyboard:[[{text:'Открыть',web_app:{url}}]]}})}
  }
}
