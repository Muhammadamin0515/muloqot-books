/* Broadcasts (message, photo, link/book buttons, survey) against `wrangler dev` started with a FAKE bot token and TG_API pointing at the mock Telegram below. */
import http from 'node:http';import {createHmac} from 'node:crypto';
const B=process.env.BASE||'http://localhost:8806',TOKEN='123456:FAKETOKEN',MOCK=+(process.env.MOCK_PORT||9999);
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const calls=[];
const mock=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{calls.push({method:req.url.split('/').pop(),body:b?JSON.parse(b):null});res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:true}))})}).listen(MOCK);
const init=(id,name='User',extra={})=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:name,...extra})});const str=[...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n');const sk=createHmac('sha256','WebAppData').update(TOKEN).digest();p.set('hash',createHmac('sha256',sk).update(str).digest('hex'));return p.toString()};
const api=async(uid,path,method='GET',body)=>{const r=await fetch(B+path,{method,headers:{'content-type':'application/json',authorization:'tma '+init(uid)},body:body&&JSON.stringify(body)});return{s:r.status,j:await r.json().catch(()=>null)}};
const secret=createHmac('sha256',TOKEN).update('muloqot-webhook').digest('hex').slice(0,48);
const hook=u=>fetch(B+'/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(u)}).then(r=>r.status);
const since=()=>calls.length,after=n=>calls.slice(n);
const send=async(body,who=1)=>{const n=since();const c=await api(who,'/api/admin/broadcasts','POST',body);if(c.s!==200)return{create:c};let b=c.j.broadcast;while(b.status==='running')b=(await api(who,`/api/admin/broadcasts/${b.id}/step`,'POST',{})).j.broadcast;return{b,sent:after(n)}};

/* readers: 11 ru, 12 uz, 13 ru; admin 1 */
for(const [id,lang] of [[11,'ru'],[12,'uz'],[13,'ru'],[1,'ru']]){await api(id,'/api/bootstrap');await api(id,'/api/state','PUT',{lang})}
ok((await api(1,'/api/admin/stats')).s===200,'admin (ADMIN_IDS) is recognised');
{const bl=(await api(1,'/api/admin/broadcasts')).j;ok(bl.reach&&bl.reach.all>=bl.reach.ru&&bl.reach.ru+bl.reach.uz===bl.reach.all,'audience counts: ru + uz = all');}
ok((await api(11,'/api/admin/broadcasts','POST',{text:'hello there',audience:'test'})).s===403,'a reader cannot broadcast');

let r=await send({text:'Новая подборка в каталоге',audience:'all'});
ok(r.b.sent===4&&r.sent.every(c=>c.method==='sendMessage'&&c.body.reply_markup.inline_keyboard[0][0].web_app),'default: message to all 4 with the "open app" web_app button');
r=await send({text:'Реклама канала',audience:'all',button:{type:'link',text:'Подробнее',url:'https://t.me/example_channel'}});
ok(r.b.sent===4&&r.sent.every(c=>c.body.reply_markup.inline_keyboard[0][0].url==='https://t.me/example_channel'&&c.body.reply_markup.inline_keyboard[0][0].text==='Подробнее'),'link button: own text and URL on every message');
r=await send({text:'Читайте!',audience:'all',button:{type:'book',text:'📖 Читать',bookId:'b1'}});
ok(r.sent.every(c=>/\/\?open=book_b1$/.test(c.body.reply_markup.inline_keyboard[0][0].web_app.url)),'book button opens that book in the app');
r=await send({text:'Без кнопки',audience:'all',button:{type:'none'}});ok(r.sent.every(c=>!c.body.reply_markup),'no button: plain message');
r=await send({text:'Скидка на подписку',audience:'all',photo:'https://example.com/banner.jpg',button:{type:'link',text:'Открыть',url:'https://example.com'}});
ok(r.sent.every(c=>c.method==='sendPhoto'&&c.body.photo==='https://example.com/banner.jpg'&&c.body.caption==='Скидка на подписку'&&c.body.reply_markup),'photo: sendPhoto with caption and button');
r=await send({text:'Только русскоязычным',audience:'all',lang:'ru'});ok(r.b.sent===3&&!r.sent.some(c=>c.body.chat_id===12),'language filter: the Uzbek reader is skipped ('+r.b.sent+' recipients)');
r=await send({text:'Тест себе',audience:'test'});ok(r.b.sent===1&&String(r.sent[0].body.chat_id)==='1','test goes to the admin only');

/* uploaded picture */
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
{const n=since();const x=await send({text:'Реклама с картинкой',audience:'all',photoData:PNG,button:{type:'link',text:'Открыть',url:'https://example.com'}});
 const url=x.sent[0].body.photo;ok(x.b.sent===4&&x.sent.every(c=>c.method==='sendPhoto'&&c.body.photo===url)&&/\/api\/bcmedia\/[a-f0-9]{20}$/.test(url),'uploaded picture: sent as a photo by the address of this app');
 const img=await fetch(B+new URL(url).pathname);ok(img.status===200&&img.headers.get('content-type')==='image/png'&&(await img.arrayBuffer()).byteLength>20,'the picture is served publicly (Telegram must be able to download it)');
 ok((await fetch(B+'/api/bcmedia/00000000000000000000')).status===404,'an unknown picture id is 404');
 ok((await api(1,'/api/admin/broadcasts')).j.list[0].photo==='uploaded','history shows an uploaded picture without its data');}
for(const [why,bodyPhoto] of [['html',"data:text/html;base64,PHNjcmlwdD4="],['svg','data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],['junk base64','data:image/png;base64,@@@'],['too large','data:image/png;base64,'+'A'.repeat(500000)]]){
  const x=await api(1,'/api/admin/broadcasts','POST',{text:'Картинка '+why,audience:'test',photoData:bodyPhoto});ok(x.s===422&&x.j.error==='photo','a picture upload of kind "'+why+'" is refused');}
ok((await api(1,'/api/admin/broadcasts','POST',{text:'a'.repeat(1001),audience:'test',photoData:PNG})).j.error==='caption_long','the 1000-character caption limit applies to uploads too');
/* validation */
const bad=async(b,code)=>{const x=await api(1,'/api/admin/broadcasts','POST',{audience:'test',...b});return x.s===422&&x.j.error===code};
ok(await bad({text:'x'},'text'),'text too short is refused');
ok(await bad({text:'Ссылка',button:{type:'link',text:'Go',url:'http://insecure.example'}},'button'),'a non-https link button is refused');
ok(await bad({text:'Ссылка',button:{type:'link',text:'',url:'https://ok.example'}},'button'),'a link button without text is refused');
ok(await bad({text:'Книга',button:{type:'book',bookId:'nonexistent'}},'book'),'a book button for an unknown book is refused');
ok(await bad({text:'a'.repeat(1001),photo:'https://example.com/a.jpg'},'caption_long'),'a caption over 1000 characters is refused');
ok(await bad({text:'Опрос?',kind:'poll',options:['Один']},'options'),'a survey needs at least 2 options');
{const n=since();await send({text:'Фото с мусором',audience:'test',photo:'javascript:alert(1)'});ok(after(n).every(c=>c.method==='sendMessage'&&!c.body.photo),'a non-https photo link is ignored: sent as a plain message');}

/* survey */
r=await send({text:'Какие книги добавить?',kind:'poll',options:['Узбекская классика','Современные романы','Детективы'],audience:'all'});
const id=r.b.id;
ok(r.b.sent===4&&r.sent.every(c=>c.body.reply_markup.inline_keyboard.length===3&&c.body.reply_markup.inline_keyboard[1][0].callback_data===`bv:${id}:1`),'survey: one answer button per option');
const vote=(uid,i,msg=5)=>hook({callback_query:{id:'cb'+uid+i,from:{id:uid,language_code:'ru'},data:`bv:${id}:${i}`,message:{chat:{id:uid},message_id:msg}}});
const n0=since();ok(await vote(11,0)===200&&await vote(12,1)===200&&await vote(13,1)===200,'answers are accepted');
let res=(await api(1,`/api/admin/broadcasts/${id}/results`)).j.broadcast;ok(res.votes.join()==='1,2,0','results are counted per option: '+res.votes);
const tail=after(n0);ok(tail.some(c=>c.method==='editMessageReplyMarkup'&&c.body.reply_markup.inline_keyboard[0][0].text.startsWith('✅')),'the chosen answer is marked with a check');
ok(tail.filter(c=>c.method==='answerCallbackQuery').every(c=>/Спасибо|Rahmat/.test(c.body.text)),'the reader gets a thank-you');
await vote(11,2);res=(await api(1,`/api/admin/broadcasts/${id}/results`)).j.broadcast;ok(res.votes.join()==='0,2,1','changing an answer replaces it, one vote per person: '+res.votes);
await vote(11,9);await hook({callback_query:{id:'x',from:{id:11},data:'bv:nonexistent:0',message:{chat:{id:11},message_id:5}}});
res=(await api(1,`/api/admin/broadcasts/${id}/results`)).j.broadcast;ok(res.votes.join()==='0,2,1','an invalid option or an unknown survey changes nothing');
ok((await api(11,`/api/admin/broadcasts/${id}/results`)).s===403,'readers cannot see results');
const hist=(await api(1,'/api/admin/broadcasts')).j.list.find(b=>b.id===id);ok(hist.kind==='poll'&&hist.votes.join()==='0,2,1'&&hist.options.length===3,'history carries the survey and its results');
mock.close();console.log(fails?`\n${fails} FAILED`:'\nall passed');process.exit(fails?1:0);
