// 앨범 잠금 코드. 빌드(Node)와 폰 브라우저가 같이 쓴다.
export const ITERATIONS = 600000;
const IV_BYTES = 12;
const subtle = globalThis.crypto.subtle;

export class WrongKeyError extends Error {
  constructor(message = '비밀번호가 맞지 않아요.') {
    super(message);
    this.name = 'WrongKeyError';
  }
}

export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const pw = new TextEncoder().encode(password.normalize('NFC'));
  const base = await subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBytes(key, bytes) {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_BYTES);
  return out;
}

export async function decryptBytes(key, blob) {
  if (blob.length <= IV_BYTES) throw new WrongKeyError();
  try {
    const iv = blob.subarray(0, IV_BYTES);
    const ct = blob.subarray(IV_BYTES);
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
  } catch {
    throw new WrongKeyError();
  }
}

export async function encryptJson(key, value) {
  return encryptBytes(key, new TextEncoder().encode(JSON.stringify(value)));
}

export async function decryptJson(key, blob) {
  return JSON.parse(new TextDecoder().decode(await decryptBytes(key, blob)));
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export { toBase64, fromBase64 };

export async function exportKey(key) {
  return toBase64(new Uint8Array(await subtle.exportKey('raw', key)));
}

export async function importKey(b64) {
  return subtle.importKey('raw', fromBase64(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}
