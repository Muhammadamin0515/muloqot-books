/* Builds small zip files for tests (stored and deflated entries). */
import {deflateRawSync} from 'node:zlib';
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc=b=>{let c=~0;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return ~c>>>0};
export function makeZip(entries){ // [{name,data:string|Buffer,deflate?:bool}]
  const chunks=[],central=[];let off=0;
  for(const e of entries){
    const name=Buffer.from(e.name),raw=Buffer.from(e.data),data=e.deflate?deflateRawSync(raw):raw,method=e.deflate?8:0;
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(method,8);h.writeUInt32LE(crc(raw),14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);
    chunks.push(h,name,data);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(crc(raw),16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(off,42);
    central.push(c,name);off+=30+name.length+data.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(off,16);
  return Buffer.concat([...chunks,cd,end]);
}
