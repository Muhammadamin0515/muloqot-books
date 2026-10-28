const encoder=new TextEncoder();
const toB64=bytes=>btoa(String.fromCharCode(...bytes));
const fromB64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

async function cryptoKey(secret){
  const raw=await crypto.subtle.digest('SHA-256',encoder.encode(String(secret||'')));
  return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
}

/** Encrypts provider credentials before they are stored in D1. */
export async function sealSecret(value,masterKey){
  if(!masterKey)throw new Error('secure_storage_not_configured');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptoKey(masterKey),encoder.encode(value));
  return `enc:v1:${toB64(iv)}:${toB64(new Uint8Array(encrypted))}`;
}

/** Decrypts a provider credential without ever returning it from an admin API. */
export async function openSecret(envelope,masterKey){
  const m=/^enc:v1:([^:]+):([^:]+)$/.exec(String(envelope||''));
  if(!m||!masterKey)throw new Error('secure_storage_unavailable');
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(m[1])},await cryptoKey(masterKey),fromB64(m[2]));
  return new TextDecoder().decode(clear);
}
