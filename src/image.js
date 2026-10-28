/* Cover images: any photo is accepted and shrunk in the browser to a 2:3 JPEG of roughly 60 to 200 KB. */
const loadBitmap=async file=>{
  if(window.createImageBitmap){try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch(e){}}
  return new Promise((res,rej)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);res(img)};img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('decode'))};img.src=url});
};
/** mode "fill" crops to the 2:3 frame, mode "fit" shows the whole picture on a dark background. */
export async function compressImage(file,{mode='fill',w=600,h=900,maxBytes=200*1024}={}){
  const bmp=await loadBitmap(file),iw=bmp.width||bmp.naturalWidth,ih=bmp.height||bmp.naturalHeight;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d');
  ctx.fillStyle='#120e0b';ctx.fillRect(0,0,w,h);
  const scale=(mode==='fit'?Math.min:Math.max)(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
  ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,(w-dw)/2,(h-dh)/2,dw,dh);
  let q=.88,url=cv.toDataURL('image/jpeg',q);
  while(url.length*.75>maxBytes&&q>.45){q-=.07;url=cv.toDataURL('image/jpeg',q)}
  return{dataUrl:url,bytes:Math.round(url.length*.75)};
}

/** A picture for a broadcast: keeps its proportions, longest side at most `max` px, JPEG of at most `maxBytes`. */
export async function compressPhoto(file,{max=1280,maxBytes=300*1024}={}){
  const bmp=await loadBitmap(file),iw=bmp.width||bmp.naturalWidth,ih=bmp.height||bmp.naturalHeight,k=Math.min(1,max/Math.max(iw,ih));
  const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(iw*k));cv.height=Math.max(1,Math.round(ih*k));
  const ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,0,0,cv.width,cv.height);
  let q=.9,url=cv.toDataURL('image/jpeg',q);
  while(url.length*.75>maxBytes&&q>.4){q-=.08;url=cv.toDataURL('image/jpeg',q)}
  return{dataUrl:url,bytes:Math.round(url.length*.75),w:cv.width,h:cv.height};
}
