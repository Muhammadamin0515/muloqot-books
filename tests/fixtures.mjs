/* Generates fixture files for browser tests: node tests/fixtures.mjs <dir> */
import {writeFileSync,mkdirSync} from 'node:fs';
import {makeZip} from './zipwriter.js';
const dir=process.argv[2]||'/tmp/fixtures';mkdirSync(dir,{recursive:true});
const para=(n,w)=>`<p>${(w+' ').repeat(n)}</p>`;
const ch=(title,n)=>`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>${title}</h1>${Array.from({length:n},(_,i)=>para(3,`Абзац ${i+1} главы «${title}», достаточно длинный для чтения и проверки прокрутки.`)).join('')}</body></html>`;
writeFileSync(dir+'/classic.epub',makeZip([
 {name:'mimetype',data:'application/epub+zip'},
 {name:'META-INF/container.xml',data:'<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'},
 {name:'OEBPS/content.opf',deflate:true,data:'<package><metadata xmlns:dc="x"><dc:title>Старый двор</dc:title><dc:creator>Иван Тестов</dc:creator><dc:language>ru</dc:language><dc:description>Рассказ о дворе, в котором прошло детство героя, и о людях, которых он там встретил.</dc:description></metadata><manifest><item id="a" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="b" href="c2.xhtml" media-type="application/xhtml+xml"/><item id="c" href="c3.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/><itemref idref="c"/></spine></package>'},
 {name:'OEBPS/c1.xhtml',deflate:true,data:ch('Двор',40)},{name:'OEBPS/c2.xhtml',deflate:true,data:ch('Река',40)},{name:'OEBPS/c3.xhtml',deflate:true,data:ch('Дом',30)}]));
// 10 s mono 8 kHz tone
const sr=8000,n=sr*10,buf=Buffer.alloc(44+n);buf.write('RIFF',0);buf.writeUInt32LE(36+n,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(sr,24);buf.writeUInt32LE(sr,28);buf.writeUInt16LE(1,32);buf.writeUInt16LE(8,34);buf.write('data',36);buf.writeUInt32LE(n,40);
for(let i=0;i<n;i++)buf[44+i]=128+Math.round(60*Math.sin(i*2*Math.PI*440/sr));
writeFileSync(dir+'/tone.wav',buf);
console.log('fixtures in',dir);
