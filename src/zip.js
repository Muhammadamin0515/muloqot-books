/* Minimal zip reader (central directory + deflate), enough for .docx and .epub. Works in the browser and in Node 18+. */
async function inflate(data){
  const r=new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
  return new Uint8Array(await r.arrayBuffer());
}
/** Returns Map<name, {size, read():Promise<Uint8Array>}>. Rejects archives that are not zip files or use unsupported methods only when read. */
export function readZip(buf){
  const u8=buf instanceof Uint8Array?buf:new Uint8Array(buf),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),dec=new TextDecoder();
  let e=-1;for(let i=u8.length-22;i>=Math.max(0,u8.length-65557);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
  if(e<0)throw Object.assign(new Error('not a zip'),{code:'zip'});
  const count=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const files=new Map();
  for(let k=0;k<count&&dv.getUint32(p,true)===0x02014b50;k++){
    const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),usize=dv.getUint32(p+24,true),nlen=dv.getUint16(p+28,true),elen=dv.getUint16(p+30,true),clen=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nlen));
    files.set(name,{size:usize,read:async()=>{
      const start=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true),data=u8.subarray(start,start+csize);
      if(method===0)return data;if(method!==8)throw Object.assign(new Error('zip method '+method),{code:'zip'});
      return inflate(data);
    }});
    p+=46+nlen+elen+clen;
  }
  return files;
}
export const readText=async(files,name)=>{const f=files.get(name);return f?new TextDecoder().decode(await f.read()):null};
