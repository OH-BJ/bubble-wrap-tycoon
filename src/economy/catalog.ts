// 도구, 뽁뽁이, 택배, 물건, 연구 정의. 밸런스 숫자는 여기와 config.ts 에서 조정한다. 화폐 단위는 원.

// g 황금, b 폭탄, m x2, s 줄무늬(한 줄 통째로), d 꽝
export type SpecialKind = 'g' | 'b' | 'm' | 's' | 'd';

// ---- 도구: 터뜨리기 쉬워진다 ----
export interface Tool {
  name: string;
  icon: string;
  /** 터뜨리는 범위 (화면 px, 1600x900 기준) */
  radius: number;
  /** 한 번 문지를 때 깎는 단단함 */
  power: number;
  cost: number;
  desc: string;
}

export const TOOLS: Tool[] = [
  { name: '손가락', icon: '👆', radius: 14, power: 1, cost: 0, desc: '한 알씩 꾹꾹' },
  { name: '손바닥', icon: '🖐️', radius: 36, power: 2, cost: 150, desc: '손바닥으로 팍팍' },
  { name: '롤러', icon: '🧻', radius: 58, power: 3, cost: 5_000, desc: '굴리면 줄줄이 터진다' },
  { name: '고무망치', icon: '🔨', radius: 85, power: 6, cost: 360_000, desc: '쾅! 단단한 것도 한 방' },
  { name: '다리미', icon: '♨️', radius: 110, power: 10, cost: 6_800_000, desc: '지나가는 곳은 전부 납작' },
  { name: '유압 프레스', icon: '🏗️', radius: 140, power: 18, cost: 540_000_000, desc: '쿵! 넓은 판으로 내리찍는다' },
  { name: '스팀롤러', icon: '🚜', radius: 175, power: 30, cost: 6_200_000_000, desc: '매트 위를 통째로 밀어버린다' },
];

// ---- 뽁뽁이 등급: 값, 단단함, 소리, 생김새, 고유 특징이 다르다 ----
export type WrapStyle = 'thin' | 'parcel' | 'thick' | 'ice' | 'big' | 'gold' | 'rainbow' | 'diamond';

export interface Wrap {
  id: WrapStyle;
  name: string;
  cost: number;
  value: number;
  cols: number;
  rows: number;
  /** 단단함: 도구 힘으로 이만큼 깎아야 터진다 */
  hp: number;
  /** 꽝(이미 터진 칸) 비율 */
  dud: number;
  /** 원래 나오는 특수 뽁뽁이 (연구 확률에 더해짐) */
  native: Partial<Record<SpecialKind, number>>;
  /** 고유 특징 설명 */
  trait: string;
  /** 말랑한 재질: 한동안 안 건드리면 다시 부풀어 오른다 */
  elastic?: boolean;
  tint: [string, string, string];
}

export const WRAPS: Wrap[] = [
  {
    id: 'thin', name: '얇은 비닐 뽁뽁이', cost: 0, value: 1, cols: 9, rows: 7, hp: 1, dud: 0.08, native: {},
    trait: '손가락으로도 톡톡 터지는 기본 뽁뽁이',
    tint: ['rgba(235,247,255,0.95)', 'rgba(120,180,235,0.55)', 'rgba(200,230,255,0.8)'],
  },
  {
    id: 'parcel', name: '택배용 에어캡', cost: 400, value: 6, cols: 10, rows: 7, hp: 1, dud: 0.06, native: { s: 0.03 },
    trait: '〰 줄무늬 뽁뽁이가 섞여 있음: 터뜨리면 한 줄이 통째로!',
    tint: ['rgba(240,250,255,0.95)', 'rgba(100,170,240,0.6)', 'rgba(190,225,255,0.85)'],
  },
  {
    id: 'thick', name: '두꺼운 에어캡', cost: 15_000, value: 40, cols: 10, rows: 8, hp: 3, dud: 0.05, native: { s: 0.02 }, elastic: true,
    trait: '고무처럼 말랑해서 쉬면 다시 부풀어요. 계속 문질러야 퍽! (단단함 3)',
    tint: ['rgba(225,255,245,0.95)', 'rgba(50,170,150,0.7)', 'rgba(140,230,210,0.95)'],
  },
  {
    id: 'ice', name: '보냉 에어캡', cost: 160_000, value: 250, cols: 10, rows: 8, hp: 5, dud: 0.04, native: { b: 0.03, s: 0.02 },
    trait: '💣 폭탄이 원래 섞여 있음. 얼음이라 금이 가면 그대로 남아요. 쨍! (단단함 5)',
    tint: ['rgba(245,252,255,0.98)', 'rgba(150,215,245,0.7)', 'rgba(230,248,255,0.98)'],
  },
  {
    id: 'big', name: '대왕 버블', cost: 2_600_000, value: 1_500, cols: 7, rows: 5, hp: 8, dud: 0.03, native: { s: 0.02 }, elastic: true,
    trait: '출렁출렁 말랑한 주먹만 한 버블, 쉬면 다시 부풀어요. 터지면 펑! (단단함 8)',
    tint: ['rgba(255,245,255,0.95)', 'rgba(210,110,225,0.62)', 'rgba(250,200,255,0.9)'],
  },
  {
    id: 'gold', name: '황금 에어캡', cost: 17_000_000, value: 8_000, cols: 11, rows: 8, hp: 12, dud: 0.03, native: { g: 0.08, s: 0.02 },
    trait: '✨ 황금 뽁뽁이가 원래 잘 나옴. 띠링~ (단단함 12)',
    tint: ['rgba(255,250,220,0.98)', 'rgba(215,160,30,0.75)', 'rgba(255,225,130,0.95)'],
  },
  {
    id: 'rainbow', name: '무지개 에어캡', cost: 800_000_000, value: 50_000, cols: 11, rows: 9, hp: 16, dud: 0.02, native: { m: 0.03, g: 0.03, s: 0.02 },
    trait: '✖️ x2 뽁뽁이가 원래 섞여 있음. 터질 때마다 화음이 울림 (단단함 16)',
    tint: ['rgba(255,255,255,0.98)', 'rgba(255,140,200,0.6)', 'rgba(255,230,250,0.98)'],
  },
  {
    id: 'diamond', name: '다이아 에어캡', cost: 10_000_000_000, value: 300_000, cols: 12, rows: 9, hp: 25, dud: 0.02, native: { g: 0.03, s: 0.03 },
    trait: '쨍그랑 깨지는 보석 버블. 스팀롤러로 밀어야 제맛 (단단함 25)',
    tint: ['rgba(240,255,255,0.98)', 'rgba(110,220,255,0.7)', 'rgba(220,255,255,0.98)'],
  },
];

// ---- 택배 등급: 내용물이 좋아진다 ----
export type Rarity = 'c' | 'u' | 'r' | 'l';

export interface Box {
  id: string;
  name: string;
  cost: number;
  /** 물건 개수 [최소, 최대] */
  items: [number, number];
  /** 물건 감정가 배율 */
  mult: number;
  /** 희귀도별 확률 (나머지는 흔함) */
  rarity: Record<Exclude<Rarity, 'c'>, number>;
  color: string;
  tape: string;
  label: string;
}

export const BOXES: Box[] = [
  { id: 'local', name: '동네 택배', cost: 0, items: [1, 1], mult: 1, rarity: { u: 0.15, r: 0.02, l: 0.002 }, color: '#c8955a', tape: '#d9b46a', label: '' },
  { id: 'large', name: '대형 상자', cost: 1_500, items: [1, 2], mult: 8, rarity: { u: 0.22, r: 0.04, l: 0.004 }, color: '#b88550', tape: '#d9b46a', label: 'FRAGILE' },
  { id: 'overseas', name: '해외 직구', cost: 79_000, items: [2, 3], mult: 60, rarity: { u: 0.28, r: 0.08, l: 0.01 }, color: '#a8794a', tape: '#5aa0d9', label: 'AIR MAIL' },
  { id: 'mystery', name: '미스터리 박스', cost: 1_200_000, items: [2, 3], mult: 700, rarity: { u: 0.32, r: 0.12, l: 0.02 }, color: '#5b3d8a', tape: '#ffcf3f', label: '???' },
  { id: 'vip', name: 'VIP 금고 상자', cost: 210_000_000, items: [2, 3], mult: 6_000, rarity: { u: 0.34, r: 0.16, l: 0.04 }, color: '#1f4d3a', tape: '#c9a227', label: 'VIP' },
  { id: 'legend', name: '전설의 상자', cost: 4_500_000_000, items: [3, 4], mult: 60_000, rarity: { u: 0.35, r: 0.2, l: 0.06 }, color: '#2b2b3a', tape: '#ffd700', label: 'LEGEND' },
];

// ---- 상자 속 물건 ----
export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
}

const item = (id: string, icon: string, name: string, rarity: Rarity): ItemDef => ({ id, icon, name, rarity });

export const ITEMS: ItemDef[] = [
  item('socks', '🧦', '양말', 'c'),
  item('book', '📚', '책', 'c'),
  item('lotion', '🧴', '로션', 'c'),
  item('tumbler', '🥤', '텀블러', 'c'),
  item('bear', '🧸', '곰인형', 'c'),
  item('battery', '🔋', '건전지', 'c'),
  item('candle', '🕯️', '양초', 'c'),
  item('mug', '☕', '머그컵', 'c'),
  item('headphone', '🎧', '헤드폰', 'u'),
  item('watch', '⌚', '손목시계', 'u'),
  item('gamepad', '🎮', '게임패드', 'u'),
  item('sneakers', '👟', '운동화', 'u'),
  item('plant', '🪴', '화분', 'u'),
  item('radio', '📻', '라디오', 'u'),
  item('phone', '📱', '스마트폰', 'r'),
  item('laptop', '💻', '노트북', 'r'),
  item('camera', '📷', '카메라', 'r'),
  item('guitar', '🎸', '기타', 'r'),
  item('telescope', '🔭', '망원경', 'r'),
  item('diamond', '💎', '다이아몬드', 'l'),
  item('crown', '👑', '왕관', 'l'),
  item('trophy', '🏆', '트로피', 'l'),
  item('ufo', '🛸', 'UFO 모형', 'l'),
];

/** 희귀도별 감정가 (택배 배율을 곱함) */
export const RARITY_VALUE: Record<Rarity, number> = { c: 10, u: 40, r: 150, l: 1000 };
export const RARITY_NAME: Record<Rarity, string> = { c: '흔함', u: '고급', r: '희귀', l: '전설' };
export const RARITY_COLOR: Record<Rarity, string> = { c: '#c9d3dc', u: '#6ed282', r: '#5aa8ff', l: '#ffb800' };

// ---- 연구 (레벨제 업그레이드) ----
export type ResearchId = 'rub' | 'gold' | 'bomb' | 'double' | 'combo' | 'perfect' | 'appraiser' | 'auctioneer' | 'promo';

/** 레벨제 업그레이드 (연구, 자동화) */
export interface LevelDef<T extends string> {
  id: T;
  icon: string;
  name: string;
  max: number;
  cost: (level: number) => number;
  desc: (level: number) => string;
}

export type ResearchDef = LevelDef<ResearchId>;

const geo = (base: number, growth: number) => (l: number) => Math.round(base * Math.pow(growth, l));

export const RESEARCH: ResearchDef[] = [
  {
    id: 'rub',
    icon: '🧤',
    name: '쓱쓱 장갑',
    max: 1,
    cost: () => 1_500_000,
    desc: () => '누른 채로 끌면 지나가는 뽁뽁이가 줄줄이 터짐! (없으면 클릭 한 번에 한 번만)',
  },
  {
    id: 'gold',
    icon: '✨',
    name: '황금 뽁뽁이',
    max: 5,
    cost: geo(150, 7),
    desc: (l) => `한 알에 25배! 등장 확률 ${l}% → ${l + 1}%`,
  },
  {
    id: 'bomb',
    icon: '💣',
    name: '폭탄 뽁뽁이',
    max: 5,
    cost: geo(400, 7),
    desc: (l) => `주변 8칸을 연쇄로 터뜨림. 확률 ${(l * 1.5).toFixed(1)}% → ${((l + 1) * 1.5).toFixed(1)}%`,
  },
  {
    id: 'double',
    icon: '✖️',
    name: 'x2 뽁뽁이',
    max: 4,
    cost: geo(2_000, 9),
    desc: (l) => `그 시트의 남은 수익 2배 (최대 x4). 확률 ${(l * 0.6).toFixed(1)}% → ${((l + 1) * 0.6).toFixed(1)}%`,
  },
  {
    id: 'combo',
    icon: '🔥',
    name: '집중력',
    max: 4,
    cost: geo(500, 10),
    desc: (l) => `빠르게 이어 터뜨리면 콤보 배수. 최대 x${1 + l * 0.5} → x${1 + (l + 1) * 0.5}`,
  },
  {
    id: 'perfect',
    icon: '💯',
    name: '완벽주의',
    max: 5,
    cost: geo(1_000, 9),
    desc: (l) => `한 장을 전부 터뜨리면 그 시트 수익의 +${l * 10}% → +${(l + 1) * 10}% 보너스`,
  },
  {
    id: 'appraiser',
    icon: '🔍',
    name: '감정사',
    max: 4,
    cost: geo(300, 9),
    desc: (l) => `물건의 예상 시세 범위가 좁아짐 (${100 - l * 20}% → ${100 - (l + 1) * 20}%)`,
  },
  {
    id: 'auctioneer',
    icon: '🎩',
    name: '실력파 경매사',
    max: 5,
    cost: geo(1_000, 9),
    desc: (l) => `욕심낸 가격에도 팔릴 확률 +${l * 6}% → +${(l + 1) * 6}%, 입찰 전쟁 확률 증가`,
  },
  {
    id: 'promo',
    icon: '📣',
    name: '경매장 홍보',
    max: 4,
    cost: geo(3_000, 10),
    desc: (l) => `손님이 늘어 입찰이 빨라짐 (+${l * 25}% → +${(l + 1) * 25}%)`,
  },
];

export const RESEARCH_IDS = RESEARCH.map((r) => r.id);

// ---- 자동화: 손이 하던 일을 기계가 대신한다 (희귀 물건과 황금은 여전히 손으로) ----
export type AutoId = 'cutter' | 'conveyor' | 'arm' | 'press';

/** 레벨별 성능 (0레벨 = 없음) */
export const AUTO_SPEC = {
  /** 테이프 다 뜯는 데 걸리는 시간 */
  cutTime: [0, 3, 1.8, 1, 0],
  /** 상자가 떨어져서 책상에 닿는 시간 (즉시 개봉 커터는 이때 연다) */
  landTime: 0.45,
  /** 로봇팔이 물건 하나 옮기는 간격 */
  armInterval: [0, 1.6, 1, 0.55, 0.55, 0.55],
  /** 로봇팔이 옮겨주는 희귀도 (레벨별) */
  armRarities: ['', 'cu', 'cu', 'cu', 'cur', 'curl'],
  /** 프레스: 초당 횟수, 힘 */
  pressRate: [0, 0.6, 1, 1.5, 2.2, 3.2],
  pressPower: [0, 4, 8, 14, 22, 32],
};

export const AUTOMATIONS: LevelDef<AutoId>[] = [
  {
    id: 'cutter',
    icon: '✂️',
    name: '자동 커터',
    max: 4,
    cost: (l) => [30_000, 240_000, 1_920_000, 300_000_000][l],
    desc: (l) =>
      l === 0
        ? `상자가 오면 로봇이 테이프를 뜯어줌 (${AUTO_SPEC.cutTime[1]}초)`
        : l === 3
          ? '⚡ 즉시 개봉: 상자가 책상에 닿자마자 바로 열림!'
          : `테이프 뜯는 시간 ${AUTO_SPEC.cutTime[l]}초 → ${AUTO_SPEC.cutTime[l + 1]}초`,
  },
  {
    id: 'conveyor',
    icon: '🚚',
    name: '컨베이어 벨트',
    max: 1,
    cost: () => 400_000,
    desc: () => '빈 상자와 다 쓴 시트를 치우고, 다음 택배를 알아서 주문',
  },
  {
    id: 'arm',
    icon: '🦾',
    name: '정리 로봇팔',
    max: 5,
    cost: (l) => [2_000_000, 16_000_000, 128_000_000, 800_000_000, 5_000_000_000][l],
    desc: (l) =>
      l === 0
        ? '흔한·고급 물건을 시세대로 경매에 올리고 뽁뽁이를 펼쳐줌. 희귀 이상은 손으로!'
        : l === 3
          ? '🔷 희귀 물건도 시세대로 경매에 올려줌 (전설은 아직 손으로)'
          : l === 4
            ? '🌟 전설 물건까지 전부 자동으로 경매에 올려줌'
            : `더 빨라짐 (${AUTO_SPEC.armInterval[l]}초 → ${AUTO_SPEC.armInterval[l + 1]}초). 희귀 이상은 손으로!`,
  },
  {
    id: 'press',
    icon: '🏭',
    name: '자동 프레스',
    max: 5,
    cost: geo(5_000_000, 5),
    desc: (l) =>
      `3x3을 쾅! 초당 ${AUTO_SPEC.pressRate[l]}회 → ${AUTO_SPEC.pressRate[l + 1]}회, 힘 ${AUTO_SPEC.pressPower[l]} → ${AUTO_SPEC.pressPower[l + 1]}. 황금은 손으로!`,
  },
];

export const AUTO_IDS = AUTOMATIONS.map((a) => a.id);

// ---- 최종 목표 ----
export const GOAL = { name: '세계에서 가장 큰 뽁뽁이', cost: 100_000_000_000 };

export type Ladder = 'tool' | 'wrap' | 'box';
export const LADDERS: Record<Ladder, { cost: number; name: string }[]> = {
  tool: TOOLS,
  wrap: WRAPS,
  box: BOXES,
};

// ---- 도감 완성 보상: 희귀도별로 전부 모으면 경매 낙찰가가 영구히 오른다 ----
export const COLLECTION_BONUS: Record<Rarity, number> = { c: 0.05, u: 0.1, r: 0.15, l: 0.25 };

// ---- 책상 꾸미기: 보기 좋고, 작은 혜택도 있다 ----
export type DecorId = 'lamp' | 'plant' | 'radio' | 'cat';

export interface DecorDef {
  id: DecorId;
  icon: string;
  name: string;
  cost: number;
  desc: string;
}

export const DECOR: DecorDef[] = [
  { id: 'lamp', icon: '💡', name: '데스크 스탠드', cost: 300_000, desc: '책상이 환해져서 뽁뽁이 수입 +10%' },
  { id: 'plant', icon: '🪴', name: '몬스테라 화분', cost: 3_000_000, desc: '분위기가 좋아져서 경매 낙찰가 +10%' },
  { id: 'radio', icon: '📻', name: '레트로 라디오', cost: 30_000_000, desc: '신나는 음악에 콤보 유지 시간 +0.25초' },
  { id: 'cat', icon: '🐈', name: '고양이', cost: 300_000_000, desc: '가끔 매트 위를 걸어가며 뽁뽁이를 밟아 터뜨림 (황금은 안 밟음)' },
];

export const DECOR_IDS = DECOR.map((d) => d.id);

// ---- 엔딩: 세계에서 가장 큰 뽁뽁이 ----
export const FINALE = { grade: 7, cols: 8, rows: 5 };
