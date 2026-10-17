import type { Game } from '../core/game';
import { COLLECTION_BONUS, ITEMS, RARITY_COLOR, RARITY_NAME, type Rarity } from '../economy/catalog';
import { completedRarities } from '../economy/rules';
import { formatWon } from './format';

const $ = (id: string) => document.getElementById(id)!;

/** 수집 도감: 지금까지 나온 물건, 판매 기록, 희귀도별 완성 보상 */
export class Book {
  private el = $('book');

  constructor(private game: Game, private onClose: () => void) {
    $('bookClose').addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
  }

  get isOpen() {
    return this.el.classList.contains('on');
  }

  open() {
    this.render();
    this.el.classList.add('on');
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    this.onClose();
  }

  private render() {
    const s = this.game.state;
    const done = completedRarities(s);
    $('bookCount').textContent = `${s.found.length} / ${ITEMS.length}`;
    const sections = (['c', 'u', 'r', 'l'] as Rarity[]).map((r) => {
      const items = ITEMS.filter((it) => it.rarity === r);
      const got = items.filter((it) => s.found.includes(it.id)).length;
      const complete = done.includes(r);
      const cards = items
        .map((it) => {
          if (!s.found.includes(it.id)) {
            return `<div class="card unknown"><span class="ic">❔</span><b>???</b><p>아직 못 봤어요</p></div>`;
          }
          const rec = s.collection[it.id];
          const record = rec ? `최고 ${formatWon(rec.best)}<br>${rec.sold}번 판매` : '아직 안 팔았어요';
          return `<div class="card" style="--c:${RARITY_COLOR[r]}"><span class="ic">${it.icon}</span><b>${it.name}</b><p>${record}</p></div>`;
        })
        .join('');
      const reward = `완성 보상: 경매 낙찰가 +${Math.round(COLLECTION_BONUS[r] * 100)}%`;
      return `<section>
        <h3 style="color:${RARITY_COLOR[r]}">${RARITY_NAME[r]} <small>${got} / ${items.length}</small></h3>
        <p class="reward ${complete ? 'done' : ''}">${complete ? '✔ ' : '🔒 '}${reward}</p>
        <div class="cards">${cards}</div>
      </section>`;
    });
    $('bookBody').innerHTML = sections.join('');
  }
}
