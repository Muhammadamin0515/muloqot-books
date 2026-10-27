import test from 'node:test';import assert from 'node:assert/strict';
import {makeZip} from './zipwriter.js';
import {epubToBook,decodeEntities,htmlToBlocks} from '../src/epub.js';
import {parseManuscript} from '../worker/parse.js';

const para=n=>`<p>${'Это длинный абзац книги про двор, реку и дом &amp; людей. '.repeat(n)}</p>`;
const xhtml=(body)=>`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body>${body}</body></html>`;
const epub=(extra=[])=>makeZip([
  {name:'mimetype',data:'application/epub+zip'},
  {name:'META-INF/container.xml',data:'<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'},
  {name:'OEBPS/content.opf',deflate:true,data:`<package><metadata xmlns:dc="x"><dc:title>Дом &amp; река</dc:title><dc:creator>Иван Тестов</dc:creator><dc:language>ru</dc:language><dc:description>Короткое описание</dc:description></metadata>
    <manifest><item id="c0" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="a" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="b" href="text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="n" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>
    <spine><itemref idref="c0"/><itemref idref="a"/><itemref idref="b"/></spine></package>`},
  {name:'OEBPS/toc.ncx',data:'<ncx><navMap><navPoint><navLabel><text>Начало</text></navLabel><content src="text/ch1.xhtml"/></navPoint><navPoint><navLabel><text>Продолжение</text></navLabel><content src="text/ch2.xhtml"/></navPoint></navMap></ncx>'},
  {name:'OEBPS/cover.xhtml',data:xhtml('<p>Обложка</p>')},
  {name:'OEBPS/text/ch1.xhtml',deflate:true,data:xhtml('<h1>Глава первая</h1>'+para(6)+para(5))},
  {name:'OEBPS/text/ch2.xhtml',data:xhtml(para(8)+'<p>Ещё&nbsp;абзац&#33;</p>')},
  ...extra]);

test('epub: metadata, chapters, entities',async()=>{
  const {text,meta}=await epubToBook(epub());
  assert.equal(meta.title,'Дом & река');assert.equal(meta.author,'Иван Тестов');assert.equal(meta.lang,'ru');
  assert.ok(!text.includes('Обложка'),'cover page is skipped');
  const ch=parseManuscript(text);
  assert.equal(ch.length,2);assert.equal(ch[0].t,'Глава первая');assert.equal(ch[1].t,'Продолжение','TOC title used when the file has no heading');
  assert.equal(ch[0].p.length,2);assert.ok(ch[0].p[0].includes('дом & людей'));assert.ok(ch[1].p.at(-1)==='Ещё абзац!');
});
test('epub: DRM-protected files are refused',async()=>{
  const enc='<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>';
  await assert.rejects(epubToBook(epub([{name:'META-INF/encryption.xml',data:enc}])),{code:'drm'});
});
test('epub: not an epub / empty',async()=>{
  await assert.rejects(epubToBook(Buffer.from('hello world, definitely not a zip file at all')),{code:'zip'});
  await assert.rejects(epubToBook(makeZip([{name:'a.txt',data:'x'}])),{code:'epub'});
});
test('entities and blocks',()=>{
  assert.equal(decodeEntities('a&nbsp;b &mdash; &#x41;&#66;&unknown;'),'a b — AB&unknown;');
  assert.deepEqual(htmlToBlocks('<body><h2>T</h2><p>one</p>two<br/>three</body>').map(b=>b.h||b.p),['T','one','two','three']);
});
