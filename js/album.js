// 앨범 열기: 비밀번호(또는 기억해 둔 키)로 목록을 풀고, 사진·영상은 누를 때 풀어서 주소로 만든다.
import {
  deriveKey, decryptBytes, decryptJson, importKey, exportKey, fromBase64, WrongKeyError,
} from './crypto.js';

export class WrongPasswordError extends Error {
  constructor(message = '비밀번호가 맞지 않아요. 다시 입력해 주세요.') {
    super(message);
    this.name = 'WrongPasswordError';
  }
}

const defaults = {
  makeUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
};

// 브라우저용: data/ 폴더에서 파일을 가져온다.
export function httpFetchBytes(base = 'data/') {
  return async (name) => {
    const res = await fetch(base + name, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${name} 파일을 가져오지 못했어요 (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };
}

async function finishOpen(key, fetchBytes, opts) {
  const { makeUrl, revokeUrl } = { ...defaults, ...opts };
  let manifest;
  try {
    manifest = await decryptJson(key, await fetchBytes('index.bin'));
  } catch (e) {
    if (e instanceof WrongKeyError || e instanceof SyntaxError) throw new WrongPasswordError();
    throw e;
  }

  const cache = new Map(); // fileId -> Promise<url>
  return {
    items: manifest.items,
    messages: manifest.messages,
    keyB64: await exportKey(key),
    blobUrl(fileId, mime) {
      if (!cache.has(fileId)) {
        cache.set(fileId, (async () => {
          const bytes = await decryptBytes(key, await fetchBytes(`${fileId}.bin`));
          return makeUrl(new Blob([bytes], { type: mime }));
        })());
      }
      return cache.get(fileId);
    },
    async revoke() {
      const pending = [...cache.values()];
      cache.clear();
      for (const result of await Promise.allSettled(pending)) {
        if (result.status === 'fulfilled') revokeUrl(result.value);
      }
    },
  };
}

export async function openWithPassword(password, fetchBytes, opts = {}) {
  const meta = JSON.parse(new TextDecoder().decode(await fetchBytes('meta.json')));
  const key = await deriveKey(password, fromBase64(meta.salt), meta.iterations);
  return finishOpen(key, fetchBytes, opts);
}

export async function openWithKey(keyB64, fetchBytes, opts = {}) {
  let key;
  try {
    key = await importKey(keyB64);
  } catch {
    throw new WrongPasswordError();
  }
  return finishOpen(key, fetchBytes, opts);
}
