import type { Game } from '../core/game';
import { AUTOMATIONS, BOXES, DECOR, GOAL, RESEARCH, TOOLS, WRAPS, type AutoId, type DecorId, type Ladder, type ResearchId } from '../economy/catalog';
import { autoCost, nextCost, researchCost } from '../economy/rules';
import { formatWon } from './format';

const $ = (id: string) => document.getElementById(id)!;

interface Step {
  icon: string;
  name: string;
  desc: string;
}

function step(ladder: Ladder, i: number): Step {
  if (ladder === 'tool') return { icon: TOOLS[i].icon, name: TOOLS[i].name, desc: `${TOOLS[i].desc} · 힘 ${TOOLS[i].power}` };
  if (ladder === 'wrap') {
    const w = WRAPS[i];
    return { icon: '🫧', name: w.name, desc: `한 알 ${formatWon(w.value)} · 단단함 ${w.hp} · ${w.trait}` };
  }
  const b = BOXES[i];
  const n = b.items[0] === b.items[1] ? `${b.items[0]}개` : `${b.items[0]}~${b.items[1]}개`;
  return { icon: i >= 3 ? '🎁' : '📦', name: b.name, desc: `물건 ${n} · 감정가 x${b.mult} · 희귀 ${Math.round(b.rarity.r * 100)}%` };
}

const TITLES: Record<Ladder, [string, string]> = {
  tool: ['🖐 도구', '힘이 셀수록 단단한 뽁뽁이도 한 번에'],
  wrap: ['🫧 뽁뽁이', '다음 택배부터 한 알 값이 올라요'],
  box: ['📦 택배', '다음 주문부터 더 비싼 물건이 와요'],
};

export type Purchase = { ladder: Ladder } | { research: ResearchId } | { auto: AutoId } | { decor: DecorId } | { goal: true };

export class Shop {
  private el = $('shop');
  private body = $('shopBody');
  private money = $('shopMoney');
  private signature = '';
  private goalConfirm = false;

  constructor(private game: Game, private onBuy: (p: Purchase) => void, private onClose: () => void) {
    $('shopClose').addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    this.body.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-buy],[data-research],[data-auto],[data-decor],[data-goal]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.goal !== undefined) {
        // 실수 방지: 두 번 눌러야 산다
        if (!this.goalConfirm) {
          this.goalConfirm = true;
          this.refresh(true);
          return;
        }
        this.goalConfirm = false;
        this.onBuy({ goal: true });
        this.close();
        return;
      }
      if (btn.dataset.decor) {
        this.onBuy({ decor: btn.dataset.decor as DecorId });
        this.refresh(true);
        return;
      }
      if (btn.dataset.buy) this.onBuy({ ladder: btn.dataset.buy as Ladder });
      else if (btn.dataset.auto) this.onBuy({ auto: btn.dataset.auto as AutoId });
      else this.onBuy({ research: btn.dataset.research as ResearchId });
      this.refresh(true);
    });
  }

  get isOpen() {
    return this.el.classList.contains('on');
  }

  open() {
    this.goalConfirm = false;
    this.el.classList.add('on');
    this.refresh(true);
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    this.onClose();
  }

  /** 내용이 바뀔 때만 다시 그린다 (누르는 도중에 버튼이 바뀌지 않게) */
  refresh(force = false) {
    if (!this.isOpen) return;
    this.money.textContent = formatWon(this.game.state.money);
    const html = (['tool', 'wrap', 'box'] as Ladder[]).map((l) => this.column(l)).join('') + this.automation() + this.lab() + this.decor() + this.goal();
    if (!force && html === this.signature) return;
    this.signature = html;
    this.body.innerHTML = html;
  }

  private column(ladder: Ladder): string {
    const s = this.game.state;
    const level = s[ladder];
    const cur = step(ladder, level);
    const cost = nextCost(s, ladder);
    const [title, sub] = TITLES[ladder];
    let next = `<div class="next done">✔ 최고 단계 달성!</div>`;
    if (cost !== Infinity) {
      const n = step(ladder, level + 1);
      const ok = cost <= s.money;
      next = `<div class="next">
        <div class="tag">다음 단계</div>
        <div class="row"><span class="ic">${n.icon}</span><div><b>${n.name}</b><p>${n.desc}</p></div></div>
        <button data-buy="${ladder}" ${ok ? '' : 'disabled'}>${ok ? '구매' : '부족'} · ${formatWon(cost)}</button>
      </div>`;
    }
    const total = ladder === 'tool' ? TOOLS.length : ladder === 'wrap' ? WRAPS.length : BOXES.length;
    const pips = Array.from({ length: total }, (_, i) => `<i class="${i <= level ? 'on' : ''}"></i>`).join('');
    return `<section>
      <h3>${title}</h3><p class="sub">${sub}</p>
      <div class="cur"><span class="ic">${cur.icon}</span><div><small>지금</small><b>${cur.name}</b><p>${cur.desc}</p></div></div>
      <div class="pips">${pips}</div>
      ${next}
    </section>`;
  }

  private automation(): string {
    const s = this.game.state;
    const items = AUTOMATIONS.map((a) => {
      const level = s.auto[a.id];
      const cost = autoCost(s, a.id);
      const max = cost === Infinity;
      const ok = cost <= s.money;
      const btn = max
        ? `<button disabled class="max">${a.max > 1 ? 'MAX' : '보유'}</button>`
        : `<button data-auto="${a.id}" ${ok ? '' : 'disabled'}>${level ? '강화' : '설치'} · ${formatWon(cost)}</button>`;
      return `<div class="research ${level ? '' : 'locked'}">
        <span class="ic">${a.icon}</span>
        <div><b>${a.name} ${a.max > 1 ? `<em>Lv ${level}/${a.max}</em>` : ''}</b><p>${max ? '최대 레벨' : a.desc(level)}</p></div>
        ${btn}
      </div>`;
    });
    return `<section class="lab auto"><h3>🤖 자동화</h3><p class="sub">기계가 일을 대신해요. 책상 위 스위치로 켜고 끌 수 있어요</p><div class="grid">${items.join('')}</div></section>`;
  }

  private lab(): string {
    const s = this.game.state;
    const items = RESEARCH.map((r) => {
      const level = s.research[r.id];
      const cost = researchCost(s, r.id);
      const max = cost === Infinity;
      const ok = cost <= s.money;
      const btn = max
        ? `<button disabled class="max">MAX</button>`
        : `<button data-research="${r.id}" ${ok ? '' : 'disabled'}>${level ? '강화' : '해금'} · ${formatWon(cost)}</button>`;
      return `<div class="research ${level ? '' : 'locked'}">
        <span class="ic">${r.icon}</span>
        <div><b>${r.name} <em>Lv ${level}/${r.max}</em></b><p>${max ? '최대 레벨' : r.desc(level)}</p></div>
        ${btn}
      </div>`;
    });
    return `<section class="lab"><h3>🔬 연구소</h3><p class="sub">특수 뽁뽁이와 경매를 강화해요</p><div class="grid">${items.join('')}</div></section>`;
  }

  private decor(): string {
    const s = this.game.state;
    const items = DECOR.map((d) => {
      const owned = s.decor[d.id];
      const ok = d.cost <= s.money;
      const btn = owned
        ? '<button disabled class="max">보유</button>'
        : `<button data-decor="${d.id}" ${ok ? '' : 'disabled'}>구매 · ${formatWon(d.cost)}</button>`;
      return `<div class="research ${owned ? '' : 'locked'}"><span class="ic">${d.icon}</span><div><b>${d.name}</b><p>${d.desc}</p></div>${btn}</div>`;
    });
    return `<section class="lab"><h3>🪴 책상 꾸미기</h3><p class="sub">보기 좋고, 작은 혜택도 있어요</p><div class="grid">${items.join('')}</div></section>`;
  }

  private goal(): string {
    const s = this.game.state;
    let btn: string;
    let note = `최종 상품 · ${formatWon(GOAL.cost)} · 책상을 덮는 초대형 뽁뽁이가 배달돼요. 다 터뜨리면 엔딩!`;
    if (s.ended) {
      btn = '<button disabled class="max">🏆 완료!</button>';
      note = '엔딩을 봤어요! 계속 자유롭게 놀 수 있어요.';
    } else if (s.finale) {
      btn = '<button disabled>배달 완료</button>';
      note = '책상 위에 와 있어요. 전부 터뜨리세요!';
    } else {
      const ok = this.game.canBuyGoal();
      btn = `<button data-goal ${ok ? '' : 'disabled'} class="${this.goalConfirm ? 'confirm' : ''}">${this.goalConfirm ? '정말 살까요? 한 번 더!' : `구매 · ${formatWon(GOAL.cost)}`}</button>`;
    }
    return `<section class="goal">
      <span class="ic">🌍</span>
      <div><b>${GOAL.name}</b><p>${note}</p></div>
      ${btn}
    </section>`;
  }
}
