/* A JPEG cover drawn from the app artwork (Telegram cards need a real picture, the artwork itself is SVG). */
import {coverSvg} from './art.js';

export async function coverJpeg(b){
  try{
    const svg=coverSvg(b,false).replace('<svg ','<svg width="300" height="450" '),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url});
    const c=document.createElement('canvas');c.width=300;c.height=450;c.getContext('2d').drawImage(img,0,0,300,450);URL.revokeObjectURL(url);
    return c.toDataURL('image/jpeg',.82);
  }catch(e){return ''}
}
