/* A small tree shaped like d0rj/RusLit but made of SYNTHETIC test texts written for this repository (no real author, no real work).
   node tests/ruslit-fixture.mjs DIR   →   DIR/prose/Testov/…, DIR/poems/Testov/… */
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';

const CP=[...'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя'];
/** windows-1251 encoder for the Cyrillic letters used in the fixtures */
export function cp1251(s){return Buffer.from([...s].map(ch=>{const i=CP.indexOf(ch);if(i>=0)return 0xc0+i;if(ch==='Ё')return 0xa8;if(ch==='ё')return 0xb8;return ch.charCodeAt(0)&0xff}))}
const para=(c,i)=>`Тестовый абзац ${i} раздела ${c}: это синтетический текст, написанный только для проверки импорта, поэтому в нём нет ни автора, ни сюжета, но есть достаточно слов, чтобы строка была похожа на абзац книги.`;
export function makeTree(dir){
  rmSync(dir,{recursive:true,force:true});
  const P=join(dir,'prose','Testov'),V=join(dir,'poems','Testov');mkdirSync(P,{recursive:true});mkdirSync(V,{recursive:true});
  const chapters=['I','II','III'].map((r,c)=>[r,...Array.from({length:30},(_,i)=>para(c+1,i+1))].join('\n\n')).join('\n\n');
  const povest=`Иван Тестов\n\nПовесть о тесте\n\n\nЧасть первая\n\n\n${chapters}\n\nПримечания\n\n1\n\nПервое тестовое примечание.\n\n2\n\nВторое тестовое примечание.\n`;
  writeFileSync(join(P,'Повесть о тесте.txt'),povest);
  writeFileSync(join(P,'Дубль повести.txt'),povest.replace('Повесть о тесте','Дубль повести'));                                   // identical content under another name
  writeFileSync(join(P,'Короткий рассказ.txt'),`   Иван Тестов\n   Короткий рассказ\n  \n`+Array.from({length:12},(_,i)=>'   '+para('рассказа',i+1)).join('\n')+'\n'); // paragraph per line, indented, no headings
  writeFileSync(join(P,'Пустой.txt'),'');
  writeFileSync(join(P,'Бинарный.txt'),Buffer.from([0x89,0x50,0x4e,0x47,0,0,0,0x0d,0x0a,0x1a,0x0a,0xff,0xfe]));
  writeFileSync(join(P,'info.csv'),'name,year\nПовесть о тесте,1900\nДубль повести,1900\nКороткий рассказ,1901-1902\nПустой,1903\nБинарный,1904\n');
  const verse=`Иван Тестов\nТестовое стихотворение\n\nПервая строка первой строфы,\nВторая строка первой строфы.\nТретья строка первой строфы,\nЧетвёртая строка первой строфы.\n\nПервая строка второй строфы,\nВторая строка второй строфы.\n`;
  writeFileSync(join(V,'Тестовое стихотворение.txt'),verse);
  writeFileSync(join(V,'Старая кодировка.txt'),cp1251(`Иван Тестов\nСтарая кодировка\n\n${Array.from({length:12},(_,i)=>`Строка ${i+1} стихотворения в кодировке windows-1251, написанная для проверки.`).join('\n')}\n`));
  writeFileSync(join(V,'info.csv'),'name,year\nТестовое стихотворение,1910\nСтарая кодировка,1911\n');
  writeFileSync(join(dir,'README.md'),'synthetic fixture');
  return{prose:P,poems:V};
}
if(import.meta.url===`file://${process.argv[1]}`){const d=process.argv[2]||'/tmp/ruslit-fixture';makeTree(d);console.log('fixture in',d)}
