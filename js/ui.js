// 화면: 잠금 → 책장(사진·영상·메시지) → 한 장 보기. 글자는 항상 텍스트로만 넣는다(innerHTML 사용 금지).
import { openWithPassword, openWithKey, WrongPasswordError, httpFetchBytes } from './album.js';
import { createStore } from './store.js';

const TITLE = '지우의 첫 콩쿠르';

export function nextIndex(current, delta, total) {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, current + delta));
}

export function swipeDelta(startX, endX, minPx = 40) {
  const d = endX - startX;
  if (d <= -minPx) return 1;
  if (d >= minPx) return -1;
  return 0;
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
export function formatDate(takenAtMs) {
  return dateFormat.format(takenAtMs);
}

// 앨범 파일에는 오래된 것부터 들어 있다. 화면에는 최신이 위로 오도록 뒤집어 보여 준다(원래 목록은 바꾸지 않는다).
export function newestFirst(items) {
  return [...items].reverse();
}

// 날짜를 모르는 사진(noDate)은 날짜를 보여 주지 않는다.
export function dateLabel(item) {
  return item.noDate ? '' : formatDate(item.takenAt);
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  return node;
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  }
}

export function main() {
  const app = document.getElementById('app');
  const store = createStore(safeStorage());
  const fetchBytes = httpFetchBytes('data/');
  let album = null;
  let tab = 'photos';

  const show = (...nodes) => { app.replaceChildren(...nodes); window.scrollTo(0, 0); };

  // ---------- 잠금 화면 ----------
  function showLock(errorText = '') {
    const input = el('input', { type: 'password', id: 'pw', autocomplete: 'off', placeholder: '비밀번호', 'aria-label': '비밀번호', enterkeyhint: 'go' });
    const remember = el('input', { type: 'checkbox', id: 'remember', checked: true });
    const message = el('p', { class: 'error', role: 'alert' }, errorText);
    const button = el('button', { type: 'submit', class: 'btn' }, '앨범 열기');
    const form = el('form', { class: 'lock-form' },
      input, message, button,
      el('label', { class: 'check', for: 'remember' }, remember, '이 폰에서 기억하기'));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.value) { message.textContent = '비밀번호를 입력해 주세요.'; return; }
      button.disabled = true;
      button.textContent = '여는 중…';
      message.textContent = '';
      try {
        album = await openWithPassword(input.value, fetchBytes);
        if (remember.checked) store.rememberKey(album.keyB64); else store.forgetKey();
        showShelf();
      } catch (e) {
        showLock(e instanceof WrongPasswordError
          ? '비밀번호가 맞지 않아요. 다시 입력해 주세요.'
          : '앨범을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 해 보세요.');
      }
    });
    show(el('main', { class: 'lock' },
      el('p', { class: 'eyebrow' }, 'Congratulations'),
      el('h1', {}, TITLE),
      el('p', { class: 'sub' }, '가족만 볼 수 있는 앨범이에요'),
      form));
    input.focus();
  }

  // ---------- 책장 ----------
  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const load = loaders.get(entry.target);
        if (load) load();
      }
    }, { rootMargin: '300px' })
    : null;
  const loaders = new WeakMap();

  function lazyThumb(fileId, alt) {
    const img = el('img', { alt, decoding: 'async' });
    const load = () => album.blobUrl(fileId, 'image/jpeg').then((url) => { img.src = url; }, () => { img.alt = '불러오지 못했어요'; });
    if (observer) { loaders.set(img, load); observer.observe(img); } else load();
    return img;
  }

  function showShelf() {
    const photos = newestFirst(album.items.filter((i) => i.kind === 'photo'));
    const videos = newestFirst(album.items.filter((i) => i.kind === 'video'));
    const tabs = [
      ['photos', '사진', photos.length],
      ['videos', '영상', videos.length],
      ['messages', '메시지', album.messages.length],
    ];

    const tabBar = el('nav', { class: 'tabs', 'aria-label': '앨범 메뉴' },
      tabs.map(([id, label, count]) => el('button', {
        type: 'button', class: id === tab ? 'tab on' : 'tab', 'aria-current': id === tab ? 'page' : null,
        onclick: () => { tab = id; showShelf(); },
      }, label, el('span', { class: 'count' }, count))));

    let body;
    if (tab === 'photos') {
      body = [
        el('header', { class: 'cover' },
          el('span', { class: 'badge' }, '준대상'),
          el('h1', {}, TITLE),
          el('p', { class: 'sub' }, '축하해, 지우야'),
          album.messages.slice(0, 2).map((m) => el('button', { type: 'button', class: 'quote', onclick: () => { tab = 'messages'; showShelf(); } },
            el('span', { class: 'quote-text' }, m.text), el('span', { class: 'quote-from' }, `— ${m.from}`)))),
        photos.length
          ? el('div', { class: 'grid' }, photos.map((item, index) => el('button', {
            type: 'button', class: 'tile', 'aria-label': `사진 ${index + 1}번 크게 보기`, onclick: () => openViewer(photos, index),
          }, lazyThumb(item.thumb, `사진 ${index + 1}`))))
          : el('p', { class: 'empty' }, '아직 사진이 없어요'),
      ];
    } else if (tab === 'videos') {
      body = [
        el('h2', { class: 'section' }, '영상'),
        videos.length
          ? el('div', { class: 'videos' }, videos.map((item, index) => el('button', {
            type: 'button', class: 'video-card', 'aria-label': `영상 ${index + 1} 재생`, onclick: () => openVideo(item),
          }, lazyThumb(item.thumb, `영상 ${index + 1}`), el('span', { class: 'play', 'aria-hidden': 'true' }, '▶'))))
          : el('p', { class: 'empty' }, '아직 영상이 없어요'),
      ];
    } else {
      body = [
        el('h2', { class: 'section' }, '가족 축하 메시지'),
        album.messages.length
          ? el('div', { class: 'messages' }, album.messages.map((m) => el('article', { class: 'msg' },
            el('p', { class: 'msg-text' }, m.text), el('p', { class: 'msg-from' }, `— ${m.from}`))))
          : el('p', { class: 'empty' }, '아직 메시지가 없어요'),
      ];
    }
    show(el('main', { class: 'shelf' }, body), tabBar);
  }

  // ---------- 영상 ----------
  async function openVideo(item) {
    const status = el('p', { class: 'viewer-status' }, '영상 불러오는 중…');
    const stage = el('div', { class: 'viewer-stage' }, status);
    const overlay = el('div', { class: 'viewer', role: 'dialog', 'aria-label': '영상 보기' },
      el('div', { class: 'viewer-top' }, el('button', { type: 'button', class: 'icon-btn', 'aria-label': '닫기', onclick: close }, '×')),
      stage);
    function close() { overlay.remove(); }
    document.body.append(overlay);
    try {
      const url = await album.blobUrl(item.full, 'video/mp4');
      if (!overlay.isConnected) return;
      stage.replaceChildren(el('video', { class: 'viewer-video', src: url, controls: true, playsinline: true }));
    } catch {
      status.textContent = '영상을 불러오지 못했어요.';
    }
  }

  // ---------- 한 장 보기 ----------
  function openViewer(list, startIndex) {
    let index = startIndex;
    let seq = 0;
    let startX = 0;
    const img = el('img', { class: 'viewer-img', alt: '지우 사진' });
    const status = el('p', { class: 'viewer-status' });
    const counter = el('span', { class: 'counter' });
    const date = el('span', { class: 'date' });
    const heart = el('button', { type: 'button', class: 'heart', onclick: () => { store.toggleHeart(list[index].id); paintHeart(); } });
    const prev = el('button', { type: 'button', class: 'nav prev', 'aria-label': '이전 사진', onclick: () => go(-1) }, '‹');
    const next = el('button', { type: 'button', class: 'nav next', 'aria-label': '다음 사진', onclick: () => go(1) }, '›');
    const stage = el('div', { class: 'viewer-stage' }, img, status, prev, next);
    const overlay = el('div', { class: 'viewer', role: 'dialog', 'aria-label': '사진 크게 보기' },
      el('div', { class: 'viewer-top' },
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': '닫기', onclick: close }, '×'), counter),
      stage,
      el('div', { class: 'viewer-bottom' }, date, heart));

    stage.addEventListener('touchstart', (e) => { startX = e.changedTouches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => { const d = swipeDelta(startX, e.changedTouches[0].clientX); if (d) go(d); }, { passive: true });
    const onKey = (e) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'Escape') close(); };

    function paintHeart() {
      const on = store.getHearts().includes(list[index].id);
      heart.textContent = on ? '♥ 좋아요' : '♡ 좋아요';
      heart.setAttribute('aria-pressed', on ? 'true' : 'false');
      heart.classList.toggle('on', on);
    }
    function go(delta) {
      const n = nextIndex(index, delta, list.length);
      if (n !== index) render(n);
    }
    function render(n) {
      index = n;
      const mine = ++seq;
      const item = list[index];
      counter.textContent = `${index + 1} / ${list.length}`;
      date.textContent = dateLabel(item);
      prev.disabled = index === 0;
      next.disabled = index === list.length - 1;
      paintHeart();
      status.textContent = '';
      album.blobUrl(item.thumb, 'image/jpeg').then((url) => { if (mine === seq) img.src = url; }, () => {});
      album.blobUrl(item.full, 'image/jpeg').then(
        (url) => { if (mine === seq) img.src = url; },
        () => { if (mine === seq) status.textContent = '사진을 불러오지 못했어요.'; });
      for (const neighbor of [list[index - 1], list[index + 1]]) {
        if (neighbor) album.blobUrl(neighbor.full, 'image/jpeg').catch(() => {});
      }
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }

    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    render(index);
  }

  // ---------- 시작 ----------
  (async () => {
    const saved = store.getRememberedKey();
    if (!saved) { showLock(); return; }
    show(el('main', { class: 'lock' }, el('h1', {}, TITLE), el('p', { class: 'sub' }, '앨범을 여는 중…')));
    try {
      album = await openWithKey(saved, fetchBytes);
      showShelf();
    } catch (e) {
      if (e instanceof WrongPasswordError) {
        store.forgetKey();
        showLock();
      } else {
        show(el('main', { class: 'lock' }, el('h1', {}, TITLE),
          el('p', { class: 'error' }, '앨범을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'),
          el('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, '다시 해 보기')));
      }
    }
  })();
}
