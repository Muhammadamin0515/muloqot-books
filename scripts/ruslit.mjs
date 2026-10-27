#!/usr/bin/env node
/* RusLit importer: fetch the source, dry-run it, import it as DRAFTS, publish an allow-list.
     node scripts/ruslit.mjs fetch   --dest DIR [--commit SHA]
     node scripts/ruslit.mjs scan    --source DIR [--limit N] [--report FILE]                  (dry-run, nothing is sent anywhere)
     node scripts/ruslit.mjs import  --source DIR --target local|URL [--limit N] [--resume] [--dry-run] [--allow-remote] [--report FILE]
     node scripts/ruslit.mjs verify  --source DIR --target local|URL [--limit N]                (reads every chapter back and compares content hashes)
     node scripts/ruslit.mjs allowlist --source DIR --out FILE [--drop-notes] [--verified-by NAME]   (proposes a list; a person must review it)
     node scripts/ruslit.mjs publish --target local|URL --allowlist FILE [--dry-run] [--allow-remote]
     node scripts/ruslit.mjs unpublish --target local|URL --ids rlXXXX,rlYYYY
   Add --drop-notes to scan/import/verify to leave out the "Примечания"/"Комментарии" sections (editorial notes of modern editions) from the prepared text.
   The target Worker must have IMPORT_TOKEN configured (secret). The token is read from the environment (or .dev.vars for local) and never printed.
   Imported books are drafts with unconfirmed rights: they are invisible to readers until "publish" applies a verified allow-list. */
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {scan,summarize,brief,SOURCE_REPO} from './ruslit/scan.js';
import {contentHash} from './ruslit/prepare.js';

const argv=process.argv.slice(2),cmd=argv[0];
const flag=n=>argv.includes('--'+n),opt=(n,d)=>{const i=argv.indexOf('--'+n);return i>=0&&argv[i+1]&&!argv[i+1].startsWith('--')?argv[i+1]:d};
const sha1=s=>createHash('sha1').update(s).digest('hex');
const nfc=s=>String(s).normalize('NFC');
const WORK=resolve('.ruslit');mkdirSync(join(WORK,'reports'),{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const log=(...a)=>console.log(...a);

function commitOf(dir){try{return execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{return 'unknown'}}

/* ---------- target selection (explicit, with a guard for anything that is not localhost) ---------- */
function target(){
  const t=opt('target');if(!t){console.error('--target local|URL is required');process.exit(2)}
  const url=(t==='local'?process.env.LOCAL_URL||'http://localhost:8787':t).replace(/\/$/,'');
  let host;try{host=new URL(url).hostname}catch{console.error('Bad --target');process.exit(2)}
  const local=['localhost','127.0.0.1','[::1]'].includes(host);
  if(!local&&!flag('allow-remote')){console.error(`Refusing to touch ${host}: it is not localhost. Add --allow-remote only after the owner has approved a production import.`);process.exit(2)}
  let token=process.env.IMPORT_TOKEN||'';
  if(!token&&local&&existsSync('.dev.vars')){const m=/^IMPORT_TOKEN=(.*)$/m.exec(readFileSync('.dev.vars','utf8'));if(m)token=m[1].trim().replace(/^["']|["']$/g,'')}
  if(!token){console.error('IMPORT_TOKEN is not set (environment variable, or .dev.vars for a local target).');process.exit(2)}
  return{url,token,local,key:sha1(url).slice(0,10)};
}
async function call(t,path,method='GET',body){
  const r=await fetch(t.url+path,{method,headers:{authorization:'Bearer '+t.token,'content-type':'application/json'},body:body&&JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(`${method} ${path} → ${r.status} ${j.error||''}`),{status:r.status,code:j.error});
  return j;
}

/* ---------- commands ---------- */
async function main(){
  if(cmd==='fetch'){
    const dest=resolve(opt('dest','/tmp/ruslit-src'));
    if(existsSync(join(dest,'.git'))){log('Source already present:',dest)}
    else{execFileSync('git',['clone','--depth','1',SOURCE_REPO,dest],{stdio:'inherit'});
      const c=opt('commit');if(c){execFileSync('git',['-C',dest,'fetch','--depth','1','origin',c],{stdio:'inherit'});execFileSync('git',['-C',dest,'checkout',c],{stdio:'inherit'})}}
    log('commit',commitOf(dest));return;
  }
  if(cmd==='scan'||(cmd==='import'&&flag('dry-run'))){
    const src=resolve(opt('source','/tmp/ruslit-src')),commit=commitOf(src),limit=+opt('limit',0);
    log(`Scanning ${src} @ ${commit}${limit?` (first ${limit} files)`:''} …`);
    const res=scan(src,{commit,limit,dropNotes:flag('drop-notes')}),sum=summarize(res);
    let plan=null;
    if(cmd==='import'){
      const t=target();const st=await call(t,'/api/import/status').catch(e=>{log('(server status unavailable: '+e.message+')');return null});
      if(st){const have=new Map(st.books.map(b=>[b.sourceId,b]));plan={wouldCreate:0,wouldUpdate:0,alreadyImported:0,skippedDuplicates:0,skippedErrors:0};
        for(const r of res.records){if(r.status==='error'){plan.skippedErrors++;continue}if(r.dupOf){plan.skippedDuplicates++;continue}const h=have.get(r.sourceId);if(!h)plan.wouldCreate++;else if(h.ver===r.version)plan.alreadyImported++;else plan.wouldUpdate++}}
    }
    const out=opt('report',join(WORK,'reports',`ruslit-${cmd==='scan'?'scan':'dry-run'}-${stamp}.json`));
    writeFileSync(out,JSON.stringify({kind:'dry-run',generated:new Date().toISOString(),source:SOURCE_REPO,commit,summary:sum,plan,errors:res.errors,csvOrphans:res.csvOrphans,ignored:res.ignored,records:res.records.map(brief)},null,1));
    log(JSON.stringify({commit,summary:sum,plan},null,1));
    log('\nSample cards:');for(const r of res.records.filter(r=>r.status!=='error').slice(0,10))log(`  ${r.id} | ${r.author} — ${r.title}${r.year?` (${r.year})`:''} | ${r.genre} | ${r.chapters} ch, ${r.chars} chars | ${r.status}${r.review.length?' ['+r.review.join('; ')+']':''}`);
    log('\nReport:',out);return;
  }
  if(cmd==='import'){
    const src=resolve(opt('source','/tmp/ruslit-src')),commit=commitOf(src),limit=+opt('limit',0),t=target();
    const stateFile=opt('state',join(WORK,`state-${t.key}.json`));
    const state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{done:{}};
    log(`Importing ${src} @ ${commit} → ${t.url}${limit?` (first ${limit})`:''}${flag('resume')?' [resume]':''}`);
    const res=scan(src,{commit,limit,dropNotes:flag('drop-notes')});log('prepared:',JSON.stringify(summarize(res)));
    const have=new Map((await call(t,'/api/import/status')).books.map(b=>[b.sourceId,b]));
    const out={kind:'import',started:new Date().toISOString(),source:SOURCE_REPO,commit,target:t.local?'local':new URL(t.url).host,results:[],summary:{}};
    const tally={created:0,updated:0,skipped_existing:0,skipped_duplicate:0,skipped_error:0,failed:0};
    let stop=false;const save=()=>{out.summary={...tally,total:out.results.length};out.finished=new Date().toISOString();
      writeFileSync(join(WORK,'reports',`ruslit-import-${stamp}.json`),JSON.stringify(out,null,1));writeFileSync(stateFile,JSON.stringify(state))};
    process.on('SIGINT',()=>{stop=true;log('\nInterrupted: finishing the current book, then saving the report. Run with --resume to continue.')});
    let n=0;
    for(const r of res.records){
      if(stop)break;n++;
      const row={id:r.id,path:r.path,title:r.title,status:r.status};
      try{
        if(r.status==='error'){tally.skipped_error++;row.result='skipped_error';row.error=r.error}
        else if(r.dupOf){tally.skipped_duplicate++;row.result='skipped_duplicate';row.dupOf=r.dupOf}
        else if(have.get(r.sourceId)?.ver===r.version){tally.skipped_existing++;row.result='skipped_existing';state.done[r.sourceId]=r.version}
        else{
          const {chunks,...record}=r;
          const b=await call(t,'/api/import/book','POST',{record});
          if(b.status==='exists'){tally.skipped_existing++;row.result='skipped_existing'}
          else{
            for(let i=0;i<chunks.length;){let size=0,j=i;while(j<chunks.length&&j-i<60&&size+chunks[j].body.length<350_000){size+=chunks[j].body.length;j++}if(j===i)j=i+1;
              await call(t,'/api/import/chunks','POST',{id:r.id,version:r.version,chunks:chunks.slice(i,j)});i=j}
            await call(t,'/api/import/finish','POST',{id:r.id,version:r.version,chunks:chunks.length});
            b.status==='created'?tally.created++:tally.updated++;row.result=b.status;state.done[r.sourceId]=r.version;
          }
        }
      }catch(e){tally.failed++;row.result='failed';row.error=e.message}
      out.results.push(row);
      if(n%25===0){log(`  ${n}/${res.records.length}`);save()}
    }
    save();log(JSON.stringify(out.summary,null,1));log('Report:',join(WORK,'reports',`ruslit-import-${stamp}.json`));
    process.exit(tally.failed?1:0);
  }
  if(cmd==='verify'){
    const src=resolve(opt('source','/tmp/ruslit-src')),t=target(),limit=+opt('limit',0);
    const res=scan(src,{commit:commitOf(src),limit,dropNotes:flag('drop-notes')}),have=new Map((await call(t,'/api/import/status')).books.map(b=>[b.sourceId,b]));
    const out={checked:0,ok:0,missing:[],mismatched:[]};
    for(const r of res.records){
      if(r.status==='error'||r.dupOf)continue;out.checked++;
      const h=have.get(r.sourceId);if(!h||!h.ver){out.missing.push(r.path);continue}
      const chapters=[];try{for(let i=0;i<r.chapters;i++){const c=await call(t,`/api/import/chapter/${r.id}/${i}`);chapters.push([c.t,c.p])}}catch(e){out.mismatched.push({path:r.path,error:e.message});continue}
      const hash=contentHash(chapters,flag('drop-notes'));
      if(hash===r.hash&&h.ver===r.version)out.ok++;else out.mismatched.push({path:r.path,expected:r.hash.slice(0,12),got:hash.slice(0,12)});
      if(out.checked%50===0)log(`  ${out.checked}`);
    }
    writeFileSync(join(WORK,'reports',`ruslit-verify-${stamp}.json`),JSON.stringify({generated:new Date().toISOString(),...out},null,1));
    log(JSON.stringify({checked:out.checked,identical:out.ok,missing:out.missing.length,mismatched:out.mismatched.length},null,1));process.exit(out.ok===out.checked?0:1);
  }
  if(cmd==='allowlist'){
    /* Proposes a publication list from the dry-run: the author's death year (reference table) must prove public domain, and only
       title/year-table doubts may remain in the metadata. Everything else stays a draft for a person to look at. */
    const src=resolve(opt('source','/tmp/ruslit-src')),commit=commitOf(src),out=opt('out',join(WORK,'allowlist.proposed.json')),by=opt('verified-by','owner');
    const res=scan(src,{commit,dropNotes:flag('drop-notes')}),now=new Date().getFullYear();
    const reviewed=JSON.parse(readFileSync(new URL('../data/ruslit/reviewed.json',import.meta.url),'utf8'));
    const soft=k=>/^(no_info_csv|not_in_info_csv|csv_name_fuzzy_match)/.test(k);
    const books=[],skipped={};const skip=(r,why)=>{(skipped[why]=skipped[why]||[]).push(r.path)};
    for(const r of res.records){
      if(r.status==='error'){skip(r,'error:'+r.error);continue}
      if(r.dupOf){skip(r,'duplicate');continue}
      if(!r.authorDeathYear||r.authorDeathYear>now-71){skip(r,'author death year unknown or too recent');continue}
      const hard=reviewed[r.path]?[]:r.review.filter(k=>!soft(k));if(hard.length){skip(r,'needs a person: '+hard.map(k=>k.split(':')[0]).join(','));continue}
      books.push({path:r.path,authorDeathYear:r.authorDeathYear,...(r.review.length?{metaConfirmed:true}:{})});
    }
    const doc={_comment:'Proposed by scripts/ruslit.mjs allowlist. Basis: the author died more than 70 years ago (reference table data/ruslit/authors.json), which is public domain in Uzbekistan for the original text. NOT verified: the specific edition, the source site, and any editorial notes. Review before publishing.',
      verifiedBy:by,verifiedOn:new Date().toISOString().slice(0,10),sourceCommit:commit,dropNotes:flag('drop-notes'),
      rights:{status:'public_domain',license:'Общественное достояние: автор умер более 70 лет назад',evidenceUrl:'https://github.com/d0rj/RusLit',note:`Основание: год смерти автора; издание, сайт-источник и редакторские примечания отдельно не проверялись.${flag('drop-notes')?' Примечания исключены из текста.':''}`},books};
    writeFileSync(out,JSON.stringify(doc,null,1));
    log(`allow-list: ${books.length} of ${res.records.length} books → ${out}`);for(const [k,v] of Object.entries(skipped))log(`  not included (${k}): ${v.length}${v.length<=8?' — '+v.join('; '):''}`);return;
  }
  if(cmd==='publish'){
    const t=target(),file=opt('allowlist');if(!file){console.error('--allowlist FILE is required');process.exit(2)}
    const al=JSON.parse(readFileSync(file,'utf8'));
    const items=(al.books||[]).map(b=>{const id=b.id||('rl'+sha1('ruslit|'+nfc(b.path)).slice(0,10));
      return{id,rights:b.rights||al.rights,authorDeathYear:b.authorDeathYear??al.authorDeathYear,metaConfirmed:!!(b.metaConfirmed??al.metaConfirmed),verifiedBy:al.verifiedBy,verifiedOn:al.verifiedOn}});
    if(!items.length){console.error('The allow-list has no books');process.exit(2)}
    if(flag('dry-run')){log(`Would publish ${items.length} books to ${t.url}:`);items.slice(0,20).forEach(i=>log(' ',i.id,JSON.stringify(i.rights)));return}
    const results=[];for(let i=0;i<items.length;i+=50)results.push(...(await call(t,'/api/import/publish','POST',{items:items.slice(i,i+50)})).results);
    const ok=results.filter(r=>r.ok).length;log(`published ${ok}, refused ${results.length-ok}`);results.filter(r=>!r.ok).forEach(r=>log('  refused',r.id,r.error));
    writeFileSync(join(WORK,'reports',`ruslit-publish-${stamp}.json`),JSON.stringify({generated:new Date().toISOString(),results},null,1));process.exit(results.every(r=>r.ok)?0:1);
  }
  if(cmd==='unpublish'){const t=target(),ids=(opt('ids','')).split(',').filter(Boolean);log(JSON.stringify(await call(t,'/api/import/unpublish','POST',{ids})));return}
  console.error(`Usage: node scripts/ruslit.mjs <fetch|scan|import|publish|unpublish> …  (see the header of this file)`);process.exit(2);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1)});
