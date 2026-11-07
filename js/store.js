// 하트와 "이 폰에서 기억하기" 저장. 저장소가 막혀 있어도(사생활 보호 모드 등) 앱은 계속 동작한다.
const HEARTS_KEY = 'jiwoo-hearts';
const KEY_KEY = 'jiwoo-key';

export function createStore(storage) {
  let hearts = null;
  let remembered = null;
  let keyLoaded = false;

  const read = (k) => { try { return storage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { storage.setItem(k, v); } catch { /* 메모리에만 둔다 */ } };
  const erase = (k) => { try { storage.removeItem(k); } catch { /* 메모리에만 둔다 */ } };

  const loadHearts = () => {
    if (hearts) return hearts;
    try {
      const parsed = JSON.parse(read(HEARTS_KEY) ?? '[]');
      hearts = new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
    } catch {
      hearts = new Set();
    }
    return hearts;
  };

  return {
    getHearts: () => [...loadHearts()],
    toggleHeart(id) {
      const set = loadHearts();
      const on = !set.has(id);
      if (on) set.add(id); else set.delete(id);
      write(HEARTS_KEY, JSON.stringify([...set]));
      return on;
    },
    getRememberedKey() {
      if (!keyLoaded) { remembered = read(KEY_KEY); keyLoaded = true; }
      return remembered;
    },
    rememberKey(keyB64) { remembered = keyB64; keyLoaded = true; write(KEY_KEY, keyB64); },
    forgetKey() { remembered = null; keyLoaded = true; erase(KEY_KEY); },
  };
}
