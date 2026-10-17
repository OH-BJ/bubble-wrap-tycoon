import { RARITY_COLOR, RARITY_NAME, type ItemDef } from '../economy/catalog';
import type { Lot } from '../core/state';
import { formatWon } from './format';

const $ = (id: string) => document.getElementById(id)!;

/** 경매 시작가 정하기 창. 진짜 시세는 모르고 예상 범위만 보고 정한다 */
export class Pricing {
  private el = $('pricing');
  private ask = 1;
  private lot: Lot | null = null;
  private onOk: ((ask: number) => void) | null = null;
  private onCancel: (() => void) | null = null;

  constructor(private sfxClick: () => void) {
    $('prOk').addEventListener('click', () => this.finish(true));
    $('prCancel').addEventListener('click', () => this.finish(false));
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.finish(false);
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
      b.addEventListener('click', () => {
        const mid = this.mid();
        const step = Math.max(1, Math.round(mid * 0.05));
        this.set(this.ask + (b.dataset.step === '+' ? step : -step));
        this.sfxClick();
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) =>
      b.addEventListener('click', () => {
        this.set(Math.round(this.mid() * Number(b.dataset.r)));
        this.sfxClick();
      }),
    );
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Enter') this.finish(true);
      else if (e.key === 'Escape') this.finish(false);
    });
  }

  get isOpen() {
    return this.el.classList.contains('on');
  }

  private mid() {
    return this.lot ? (this.lot.lo + this.lot.hi) / 2 : 1;
  }

  open(lot: Lot, def: ItemDef, onOk: (ask: number) => void, onCancel: () => void) {
    this.lot = lot;
    this.onOk = onOk;
    this.onCancel = onCancel;
    $('prIcon').textContent = def.icon;
    $('prName').textContent = def.name;
    const rarity = $('prRarity');
    rarity.textContent = RARITY_NAME[def.rarity];
    rarity.style.color = RARITY_COLOR[def.rarity];
    $('prRange').textContent = `${formatWon(lot.lo)} ~ ${formatWon(lot.hi)}`;
    this.set(Math.round(this.mid()));
    this.el.classList.add('on');
  }

  private set(ask: number) {
    const lot = this.lot!;
    this.ask = Math.max(1, Math.min(Math.round(ask), lot.hi * 10));
    $('prAsk').textContent = formatWon(this.ask);
    // 범위 막대 위의 내 가격 위치 (0 ~ 상단의 2배)
    const scale = lot.hi * 2;
    const band = $('prBand');
    band.style.left = `${(lot.lo / scale) * 100}%`;
    band.style.width = `${((lot.hi - lot.lo) / scale) * 100}%`;
    $('prMarker').style.left = `${Math.min(100, (this.ask / scale) * 100)}%`;
    // 손님 반응 (힌트 범위 기준이라 진짜 시세와는 다를 수 있음)
    const mid = this.mid();
    const r = this.ask / mid;
    const [mood, color] =
      this.ask < lot.lo
        ? ['😊 싸다! 금방 팔리겠지만 시세 근처까지만 올라요', '#3aa35a']
        : r <= 1.1
          ? ['🙂 적당해요. 손님들이 경쟁할 수도 있어요', '#2f86d9']
          : this.ask <= lot.hi
            ? ['🤔 살짝 욕심. 잘 맞으면 대박, 아니면 안 팔릴 수도', '#c98a00']
            : this.ask <= lot.hi * 1.4
              ? ['😬 비싸요. 안 팔리면 떨이로 넘어가요', '#e8663c']
              : ['😱 터무니없어요! 거의 안 팔려요', '#d8382a'];
    const m = $('prMood');
    m.textContent = mood;
    m.style.color = color;
  }

  private finish(ok: boolean) {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    const cb = ok ? this.onOk : this.onCancel;
    const ask = this.ask;
    this.onOk = this.onCancel = null;
    this.lot = null;
    if (ok) (cb as (ask: number) => void)?.(ask);
    else (cb as () => void)?.();
  }
}
