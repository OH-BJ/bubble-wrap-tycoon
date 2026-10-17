import './ui/style.css';
import { CONFIG } from './config';
import { Game } from './core/game';
import { getStorage, loadState, saveState } from './core/save';
import { AUTOMATIONS, BOXES, DECOR, ITEMS, RESEARCH, TOOLS, WRAPS } from './economy/catalog';
import { Book } from './ui/book';
import { Sfx } from './fx/audio';
import { Juice } from './fx/juice';
import { Particles } from './fx/particles';
import { resetSprites } from './scene/bubbles';
import { VH, VW } from './scene/layout';
import { DeskScene } from './scene/scene';
import { formatShort, formatWon } from './ui/format';
import { Pricing } from './ui/pricing';
import { Shop, type Purchase } from './ui/shop';
import { itemDef } from './core/game';

const MUTE_KEY = 'bbwrap.muted';

const kv = getStorage();
// 개발용: 주소 뒤에 ?reset 을 붙이면 세이브 초기화
if (new URLSearchParams(location.search).has('reset')) {
  kv?.removeItem(CONFIG.save.key);
  kv?.removeItem(CONFIG.save.backupKey);
  history.replaceState(null, '', location.pathname);
}

const loaded = loadState(kv);
const game = new Game(loaded.state);
const sfx = new Sfx();
const fx = new Particles();
const juice = new Juice();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let dpr = 1;
let scale = 1;
let ox = 0;
let oy = 0;
let cssW = 0;
let cssH = 0;
let started = false;

// 1600x900 화면을 창 크기에 맞춰 확대/축소 (남는 곳은 여백)
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = Math.min(cssW / VW, cssH / VH);
  ox = (cssW - VW * scale) / 2;
  oy = (cssH - VH * scale) / 2;
  resetSprites(scale * dpr);
}

function toVirtual(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale];
}

// ---- 저장 ----
// 같은 게임이 다른 탭/창에서 열리면 이 창은 멈추고 저장하지 않는다 (서로 덮어써서 돈이 사라지는 것 방지)
let suspended = false;
let lastSave = 0;
const tabId = Math.random().toString(36).slice(2);
try {
  const channel = new BroadcastChannel('bbwrap');
  channel.onmessage = (e) => {
    if (e.data?.type === 'hello' && e.data.id !== tabId) suspend();
  };
  channel.postMessage({ type: 'hello', id: tabId });
} catch {
  // 지원하지 않는 브라우저
}

function persist(force = false) {
  if (suspended) return;
  const now = performance.now();
  if (!force && !game.dirty && !game.critical) return;
  if (force || game.critical || now - lastSave >= CONFIG.save.throttleMs) {
    saveState(kv, game.state);
    game.dirty = false;
    game.critical = false;
    lastSave = now;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist(true);
});
window.addEventListener('pagehide', () => persist(true));
window.addEventListener('beforeunload', () => persist(true));

// ---- 장면과 상점 ----
const shop = new Shop(
  game,
  (p: Purchase) => {
    const ok =
      'ladder' in p
        ? game.buy(p.ladder)
        : 'auto' in p
          ? game.buyAuto(p.auto)
          : 'decor' in p
            ? game.buyDecor(p.decor)
            : 'goal' in p
              ? game.buyGoal()
              : game.research(p.research);
    if (!ok) {
      sfx.click();
      return;
    }
    sfx.buy();
    juice.vibrate(15, true);
    const s = game.state;
    if ('goal' in p) scene.onGoalBought();
    else if ('decor' in p) {
      const def = DECOR.find((d) => d.id === p.decor)!;
      scene.toast(`${def.icon} ${def.name}을(를) 책상에 놓았어요! ${def.desc}`);
    } else if ('auto' in p) {
      const def = AUTOMATIONS.find((a) => a.id === p.auto)!;
      if (p.auto === 'cutter' && s.auto.cutter === def.max) scene.toast('⚡ 즉시 개봉 커터! 이제 상자가 오자마자 바로 열려요');
      else if (p.auto === 'arm' && s.auto.arm === 4) scene.toast('🦾 로봇팔 Lv4! 이제 희귀 물건도 알아서 경매에 올려요');
      else if (p.auto === 'press' && s.auto.press === 6) scene.toast('✨ 황금 프레스! 이제 프레스가 황금 뽁뽁이도 터뜨려요');
      else if (p.auto === 'arm' && s.auto.arm === 5) scene.toast('🦾 로봇팔 Lv5! 전설 물건까지 전부 알아서 경매에 올려요');
      else scene.toast(`🤖 ${def.icon} ${def.name} ${s.auto[p.auto] > 1 ? `Lv ${s.auto[p.auto]}!` : '설치 완료! 책상 위 스위치로 켜고 끌 수 있어요'}`);
    } else if ('research' in p && p.research === 'rub') {
      scene.toast('🧤 쓱쓱 장갑 장착! 이제 누른 채로 끌면 줄줄이 터져요');
    } else if ('research' in p) {
      const def = RESEARCH.find((r) => r.id === p.research)!;
      scene.toast(`${def.icon} ${def.name} Lv ${s.research[p.research]}!${p.research === 'gold' || p.research === 'bomb' || p.research === 'double' ? ' (다음 택배부터)' : ''}`);
    } else if (p.ladder === 'tool') scene.toast(`${TOOLS[s.tool].icon} ${TOOLS[s.tool].name} 획득!`);
    else if (p.ladder === 'wrap')
      scene.toast(`🫧 ${WRAPS[s.wrap].name}! 한 알 ${formatWon(WRAPS[s.wrap - 1].value)} → ${formatWon(WRAPS[s.wrap].value)} (다음 택배부터)`);
    else scene.toast(`📦 ${BOXES[s.box].name}! 물건값 x${BOXES[s.box - 1].mult} → x${BOXES[s.box].mult} (다음 주문부터)`);
    persist(true);
  },
  () => sfx.click(),
);

const pricing = new Pricing(() => sfx.click());

const book = new Book(game, () => sfx.click());

const scene = new DeskScene(game, fx, juice, sfx, {
  openShop: () => shop.open(),
  openBook: () => book.open(),
  ending: () => showEnding(),
  price: (index) => {
    const lot = game.state.desk?.items[index];
    if (!lot) return;
    pricing.open(lot, itemDef(lot.kind), (ask) => scene.confirmListing(index, ask), () => sfx.click());
  },
  persist,
});

// ---- 입력 ----
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sfx.unlock();
  if (!started || suspended) return;
  canvas.setPointerCapture(e.pointerId);
  scene.pointerDown(...toVirtual(e));
  canvas.style.cursor = scene.cursor;
});
canvas.addEventListener('pointermove', (e) => {
  if (!started || suspended) return;
  const events = typeof e.getCoalescedEvents === 'function' && e.buttons ? e.getCoalescedEvents() : [];
  for (const ce of events.length ? events : [e]) scene.pointerMove(...toVirtual(ce));
  canvas.style.cursor = scene.cursor;
});
const up = (e: PointerEvent) => {
  if (!started || suspended) return;
  scene.pointerUp(...toVirtual(e));
  canvas.style.cursor = scene.cursor;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', () => scene.pointerLeave());
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    shop.close();
    book.close();
  }
});

// ---- 소리 끄기 ----
const muteButton = document.getElementById('mute')!;
try {
  sfx.muted = kv?.getItem(MUTE_KEY) === '1';
} catch {
  // 무시
}
const showMute = () => (muteButton.textContent = sfx.muted ? '🔇' : '🔊');
showMute();
muteButton.addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  showMute();
  try {
    kv?.setItem(MUTE_KEY, sfx.muted ? '1' : '0');
  } catch {
    // 무시
  }
});

// ---- 시작 화면 / 일시정지 ----
const overlay = document.getElementById('overlay')!;
function showOverlay(title: string, body: string, button: string, onClick: () => void) {
  document.getElementById('ovTitle')!.textContent = title;
  document.getElementById('ovBody')!.innerHTML = body;
  const b = document.getElementById('ovButton')!;
  b.textContent = button;
  b.onclick = () => {
    overlay.classList.remove('on');
    onClick();
  };
  overlay.classList.add('on');
}

/** 엔딩 화면: 지금까지의 기록 */
function showEnding() {
  const s = game.state;
  const m = Math.floor(s.stats.playTime / 60);
  const time = m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
  showOverlay(
    '🎉 THE END',
    `<p><b>세계에서 가장 큰 뽁뽁이</b>를 다 터뜨렸습니다!<br>동네 택배 뜯던 알바생이 뽁뽁이의 전설이 됐어요.</p>
     <ul class="stats">
       <li><span>플레이 시간</span><b>${time}</b></li>
       <li><span>처리한 택배</span><b>${s.stats.boxes.toLocaleString()}개</b></li>
       <li><span>터뜨린 뽁뽁이</span><b>${s.stats.popped.toLocaleString()}개</b></li>
       <li><span>경매 판매</span><b>${s.stats.sold.toLocaleString()}건</b></li>
       <li><span>최고 낙찰가</span><b>${formatWon(s.stats.bestSale)}</b></li>
       <li><span>도감</span><b>${s.found.length} / ${ITEMS.length}</b></li>
     </ul>
     <p>계속 자유롭게 놀 수 있어요. 도감을 채워보세요!</p>`,
    '계속 놀기',
    () => {
      game.seeEnding();
      persist(true);
      sfx.click();
    },
  );
}

function suspend() {
  if (suspended) return;
  suspended = true;
  shop.close();
  showOverlay('다른 창에서 게임이 열렸어요', '<p>진행이 꼬이지 않도록 이 창은 멈췄어요.</p>', '이 창에서 계속하기', () => location.reload());
}

{
  const fresh = loaded.source === 'new';
  const s = game.state;
  showOverlay(
    fresh ? '뽁뽁이 타이쿤' : '다시 출근!',
    fresh
      ? `<p>오늘부터 택배 뜯는 일을 시작합니다. 처음엔 푼돈이지만…</p>
         <ul><li>🛎️ 벨을 눌러 택배 주문</li><li>✂️ 테이프를 긁어서 상자 열기</li><li>🔨 물건은 경매장으로 끌어서 경매!</li><li>🫧 뽁뽁이는 매트에 펼쳐서 터뜨리기!</li><li>💻 노트북에서 도구·뽁뽁이·택배·연구 업그레이드</li></ul>`
      : `<p>${formatWon(s.money)} · 택배 ${s.stats.boxes}개 처리</p>`,
    fresh ? '출근하기' : '계속하기',
    () => {
      sfx.unlock();
      started = true;
      if (game.state.ended && !game.state.endingSeen) showEnding();
    },
  );
}

// ---- 루프 ----
let last = performance.now();
let uiTimer = 0;
function frame(ts: number) {
  // 느린 컴퓨터(10fps)까지는 게임 속도가 그대로, 그보다 느리거나 창을 내렸다 올리면 멈춘 만큼 건너뜀
  const real = Math.min(0.1, Math.max(0, (ts - last) / 1000));
  last = ts;
  const frozen = juice.hitstop > 0;
  juice.update(real);
  const dt = frozen ? 0 : real;
  if (started && !suspended) scene.update(dt, real);
  fx.update(dt);

  uiTimer -= real;
  if (uiTimer <= 0) {
    uiTimer = 0.2;
    shop.refresh();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#17110d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VW, VH);
  ctx.clip();
  const [sx, sy] = juice.offset();
  ctx.translate(sx, sy);
  scene.draw(ctx, scene.shopBadge(), formatShort);
  ctx.restore();
  if (juice.flashAlpha > 0) {
    ctx.globalAlpha = juice.flashAlpha;
    ctx.fillStyle = juice.flashColor;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
  }

  persist();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

// 개발 서버에서만: 콘솔에서 상태 확인용
if (import.meta.env.DEV) Object.assign(window, { __game: game, __scene: scene });

// 배포 버전에서만 오프라인 지원
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
