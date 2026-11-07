// 화면: 잠금 → 책장(사진·영상·메시지) → 한 장 보기. 가족이 쓴 글은 항상 텍스트로만 넣는다(innerHTML 사용 금지).
import { openWithPassword, openWithKey, WrongPasswordError, httpFetchBytes } from './album.js';
import { createStore } from './store.js';

// 표지 글: 가족이 정한 문구 그대로
export const COVER = {
  eyebrow: "JIWOO'S PIANO DAY",
  badge: '준대상',
  title: '지우의 첫 피아노 콩쿠르',
  cheer: '축하해 지우야!',
};

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

// 메시지를 줄 단위로 나눈다(빈 줄 제거). 줄마다 따로 보여 주면 읽기 편하다.
export function messageLines(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
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

// ---------- 아이콘 (코드에 고정된 그림만 쓴다. 가족이 쓴 글은 여기로 들어오지 않는다) ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  photo: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  video: '<rect x="3.5" y="5" width="17" height="14" rx="3.5"/><path d="M10.5 9.4v5.2l4.3-2.6z"/>',
  chat: '<path d="M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-6.2L8 20v-3.5H6A2.5 2.5 0 0 1 3.5 14V7A2.5 2.5 0 0 1 6 4.5z"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  note: '<path d="M9 18.5V6l11-2.5v12"/><circle cx="6.5" cy="18.5" r="2.5" fill="currentColor"/><circle cx="17.5" cy="15.5" r="2.5" fill="currentColor"/>',
  star: '<path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
  award: '<circle cx="12" cy="8.5" r="6"/><path d="M8.7 13.6L7.5 21.5l4.5-2.6 4.5 2.6-1.2-7.9"/>',
};

function icon(name, size = 22, { fill = false } = {}) {
  const paint = fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  const markup = `<svg xmlns="${SVG_NS}" viewBox="0 0 24 24" width="${size}" height="${size}" ${paint} aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  return document.importNode(new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement, true);
}

// 피아노 건반 장식. play 가 true 이면 처음 한 번 핑크로 차례차례 눌린다.
function keys(play) {
  const bar = el('div', { class: play ? 'keys intro' : 'keys', 'aria-hidden': 'true' });
  for (let i = 0; i < 14; i++) {
    bar.append(el('span', { class: 'key' }, [0, 1, 3, 4, 5].includes(i % 7) ? el('i', { class: 'bk' }) : null));
  }
  return bar;
}

// 음표 낙서 세 개 (장식)
function ornament() {
  return el('div', { class: 'ornament', 'aria-hidden': 'true' },
    el('span', { class: 'n1' }, icon('note', 26)), el('span', { class: 'n2' }, icon('note', 20)), el('span', { class: 'n3' }, icon('note', 24)));
}

// 섹션 제목: 한글 제목 옆에 개수 스티커
function sectionHead(title, count, tag = 'h2') {
  return el('div', { class: 'section' }, el(tag, {}, title), el('span', { class: 'bubble' }, count));
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
  let introPlayed = false;

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
      ornament(),
      el('span', { class: 'eyebrow' }, COVER.eyebrow),
      el('h1', {}, COVER.title),
      el('p', { class: 'sub' }, '가족만 볼 수 있는 앨범이에요'),
      form,
      keys(false)));
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

  const goMessages = () => { tab = 'messages'; showShelf(); };

  function sender(from) {
    return el('span', { class: 'from' }, from);
  }

  function showShelf() {
    const photos = newestFirst(album.items.filter((i) => i.kind === 'photo'));
    const videos = newestFirst(album.items.filter((i) => i.kind === 'video'));
    const tabs = [
      ['photos', '사진', 'photo', photos.length],
      ['videos', '영상', 'video', videos.length],
      ['messages', '메시지', 'chat', album.messages.length],
    ];

    const tabBar = el('nav', { class: 'tabs', 'aria-label': '앨범 메뉴' }, el('div', { class: 'tabs-inner' },
      tabs.map(([id, label, iconName, count]) => el('button', {
        type: 'button', class: id === tab ? 'tab on' : 'tab', 'aria-current': id === tab ? 'page' : null,
        onclick: () => { tab = id; showShelf(); },
      }, icon(iconName, 22), el('span', { class: 'tab-label' }, label, el('span', { class: 'count' }, count))))));

    let body;
    if (tab === 'photos') {
      const play = !introPlayed;
      introPlayed = true;
      body = [
        el('header', { class: 'cover' },
          keys(play),
          ornament(),
          el('span', { class: 'eyebrow' }, COVER.eyebrow),
          el('h1', {}, COVER.title),
          el('span', { class: 'medal' }, icon('star', 22, { fill: true }), COVER.badge),
          el('p', { class: 'cheer' }, el('mark', {}, COVER.cheer)),
          album.messages.length ? el('div', { class: 'quotes' },
            album.messages.slice(0, 2).map((m, index) => el('button', { type: 'button', class: `quote q${index % 4}`, onclick: goMessages },
              el('span', { class: 'quote-text' }, messageLines(m.text).join(' ')), sender(m.from)))) : null),
        sectionHead('사진', photos.length),
        photos.length
          ? el('div', { class: 'grid' }, photos.map((item, index) => el('button', {
            type: 'button', class: 'tile', 'aria-label': `사진 ${index + 1}번 크게 보기`, onclick: () => openViewer(photos, index),
          }, lazyThumb(item.thumb, `사진 ${index + 1}`))))
          : el('p', { class: 'empty' }, '아직 사진이 없어요'),
      ];
    } else if (tab === 'videos') {
      body = [
        el('header', {}, sectionHead('영상', videos.length, 'h1')),
        videos.length
          ? el('div', { class: 'videos' }, videos.map((item, index) => el('button', {
            type: 'button', class: 'video-card', 'aria-label': `영상 ${index + 1} 재생`, onclick: () => openVideo(item),
          }, el('span', { class: 'video-frame' }, lazyThumb(item.thumb, `영상 ${index + 1}`), el('span', { class: 'play', 'aria-hidden': 'true' }, icon('play', 26, { fill: true }))),
          el('span', { class: 'video-label' }, `영상 ${index + 1}`, el('span', { class: 'date' }, dateLabel(item))))))
          : el('p', { class: 'empty' }, '아직 영상이 없어요'),
      ];
    } else {
      body = [
        el('header', {}, sectionHead('가족 축하 메시지', album.messages.length, 'h1')),
        album.messages.length
          ? el('div', { class: 'messages' }, album.messages.map((m, index) => el('article', { class: 'msg' },
            el('span', { class: `tape t${index % 4}`, 'aria-hidden': 'true' }),
            el('div', { class: 'msg-text' }, messageLines(m.text).map((line) => el('span', { class: 'line' }, line))),
            sender(m.from))))
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
      el('div', { class: 'viewer-top' }, el('button', { type: 'button', class: 'icon-btn', 'aria-label': '닫기', onclick: close }, icon('close', 24))),
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
    const heart = el('button', {
      type: 'button', class: 'heart', 'aria-pressed': 'false',
      onclick: () => {
        store.toggleHeart(list[index].id);
        paintHeart();
        heart.classList.remove('pop');
        void heart.offsetWidth; // 같은 움직임을 다시 보이게 한다
        heart.classList.add('pop');
      },
    }, icon('heart', 22), el('span', {}, '좋아요'));
    const prev = el('button', { type: 'button', class: 'nav prev', 'aria-label': '이전 사진', onclick: () => go(-1) }, icon('left', 26));
    const next = el('button', { type: 'button', class: 'nav next', 'aria-label': '다음 사진', onclick: () => go(1) }, icon('right', 26));
    const stage = el('div', { class: 'viewer-stage' }, img, status, prev, next);
    const overlay = el('div', { class: 'viewer', role: 'dialog', 'aria-label': '사진 크게 보기' },
      el('div', { class: 'viewer-top' },
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': '닫기', onclick: close }, icon('close', 24)), counter),
      stage,
      el('div', { class: 'viewer-bottom' }, date, heart));

    stage.addEventListener('touchstart', (e) => { startX = e.changedTouches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => { const d = swipeDelta(startX, e.changedTouches[0].clientX); if (d) go(d); }, { passive: true });
    const onKey = (e) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'Escape') close(); };

    function paintHeart() {
      const on = store.getHearts().includes(list[index].id);
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
    show(el('main', { class: 'lock' }, el('span', { class: 'eyebrow' }, COVER.eyebrow), el('h1', {}, COVER.title), el('p', { class: 'sub' }, '앨범을 여는 중…'), ornament(), keys(false)));
    try {
      album = await openWithKey(saved, fetchBytes);
      showShelf();
    } catch (e) {
      if (e instanceof WrongPasswordError) {
        store.forgetKey();
        showLock();
      } else {
        show(el('main', { class: 'lock' }, el('h1', {}, COVER.title),
          el('p', { class: 'error' }, '앨범을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'),
          el('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, '다시 해 보기')));
      }
    }
  })();
}
