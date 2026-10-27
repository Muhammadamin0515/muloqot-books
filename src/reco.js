/* Personal recommendations from what this reader finished, saved, started, rated and follows. Returns [] when there is no signal yet,
   so the home screen does not repeat the popular list under another name. */
export function recommend({books,progress={},finished=[],saved=[],ratings={},follows=[],limit=10}){
  const byId=new Map(books.map(b=>[b.id,b]));
  const w={};const add=(id,v)=>{w[id]=(w[id]||0)+v};
  finished.forEach(id=>add(id,3));saved.forEach(id=>add(id,2));Object.keys(progress).forEach(id=>add(id,1));
  Object.entries(ratings).forEach(([id,r])=>add(id,r>=4?3:r<=2?-3:0));
  const genre={},author={},lang={};let total=0;const src={genre:{},author:{}};
  for(const [id,v] of Object.entries(w)){const b=byId.get(id);if(!b||v<=0)continue;total+=v;
    genre[b.genre]=(genre[b.genre]||0)+v;author[b.a]=(author[b.a]||0)+v;lang[b.lang]=(lang[b.lang]||0)+v;
    if(!src.genre[b.genre]||v>src.genre[b.genre].v)src.genre[b.genre]={v,b};if(!src.author[b.a]||v>src.author[b.a].v)src.author[b.a]={v,b}}
  follows.forEach(a=>{author[a]=(author[a]||0)+2;total+=2});
  if(!total)return[];
  const seen=new Set([...finished,...saved,...Object.keys(progress)]);
  const maxPop=Math.max(1,...books.map(b=>b.pop||0));
  const out=[];
  for(const b of books){
    if(seen.has(b.id)||(ratings[b.id]&&ratings[b.id]<=2))continue;
    const g=(genre[b.genre]||0)/total,a=(author[b.a]||0)/total,l=(lang[b.lang]||0)/total;
    let s=g*1+a*1.6+l*.4+(b.pop||0)/maxPop*.5+(b.count>=3?(b.rating-3)/2*.4:0);
    if(b.fullText)s*=1.25;else s*=.4; // the reader should be able to open what we recommend
    if(g+a===0)continue;
    const why=a>=g&&a>0?{kind:'author',book:src.author[b.a]?.b}:{kind:'genre',book:src.genre[b.genre]?.b};
    out.push({book:b,score:s,why});
  }
  return out.sort((x,y)=>y.score-x.score).slice(0,limit);
}
