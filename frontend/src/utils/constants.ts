import type { TradeType, Server, AssetPlacement, AssetFunction } from '../types'

export const TRADE_TYPE_LABEL: Record<TradeType, string> = {
  fixed: '即決',
  negotiable: '交渉可',
}

export const SERVER_COLORS: Record<Server, string> = {
  Emerald: 'bg-emerald-900/50 text-emerald-300',
  Diamond: 'bg-sky-900/50 text-sky-300',
  Pearl:   'bg-pink-900/50 text-pink-300',
}

export const SPECIAL_CONDITIONS: Record<string, string> = {
  NT: 'No Trade',
  OP: 'One Per Person',
  CS: "Can't Sell",
  CR: "Can't Repair",
  PM: 'Power Maintain',
  NC: 'No Cut-down',
  NB: 'No Break',
  ND: 'No Drop',
  CA: 'Chaos Age',
  DL: 'Dead Lost',
  TC: 'Time Capsule',
  LO: 'Logout',
  AL: 'Area Limit',
  WA: 'War Age',
  DA: 'Designated Area',
}

// 付加効果の数値項目名候補（追加効果の項目名 + 付加効果種別 + よく使われるラベル）
export const BONUS_VALUE_LABEL_OPTIONS: string[] = [
  // 追加効果と共通
  '攻撃力', '魔力', '攻撃ディレイ', '魔法ディレイ',
  '最大HP', '最大ST', '最大MP', '命中', '回避',
  '耐火属性', '耐地属性', '耐水属性', '耐風属性', '耐無属性',
  '最大重量', '移動速度',
  // 付加効果種別（旧"種別"セレクトの選択肢をマージ）
  '魔法スキル効果上昇', '火属性強化', '水属性強化', '風属性強化', '地属性強化',
  '無属性強化', '全属性強化',
  '物理ダメージ増加', '魔法ダメージ増加', 'クリティカル率上昇',
  '攻撃ディレイ短縮', 'スキルディレイ短縮', '詠唱速度短縮', 'MP消費軽減',
  '魔力→攻撃力変換',
  '物理ダメージ軽減', '魔法ダメージ軽減', '物理ダメージ反射', '魔法反射',
  '防御力上昇', '全属性耐性上昇', '状態異常無効', '自動復活',
  'HP自然回復', 'ST自然回復', 'MP自然回復', 'HP/ST/MP同時回復', '攻撃時吸収',
  '戦闘技術スキル上昇', '格闘系スキル上昇', '音楽スキル上昇', 'ダンススキル上昇',
  'シャウトスキル上昇', '調教スキル上昇', 'ペット成長率上昇', '専用技解放',
  '移動速度上昇', 'ジャンプ力強化', '水中移動速度上昇', '水中呼吸',
  '落下ダメージ軽減', '重量軽減', '最大重量増加', '全ステータス上昇',
  '特定種族特攻', '生産MGマス増加', '生産HGマス増加',
  '変身', 'モーション変化', 'アイテム使用ディレイ短縮',
  // その他よく使われる項目
  '物理ダメージ', '魔法ダメージ', 'クリティカル率',
  'HP回復', 'ST回復', 'MP回復',
  '消費MP', '消費ST',
]

// 追加効果・付加効果の数値表示用フォーマッタ。
// 負数（- 付き）以外は + を付けて表示する（例: 5 → "+5", -3 → "-3"）。
// 倍率（value_unit === 'x'）は増減ではないため + を付けない（例: 1.5倍）。
export function formatSignedValue(value: number | string, unit?: string): string {
  const s = String(value)
  if (unit === 'x') return s
  return s.startsWith('-') ? s : `+${s}`
}

// キーの定義順がセレクトボックス等の選択肢の表示順になる（STAT_INPUT_COLUMNS の1列目→2列目→3列目と同順）
export const BASE_STAT_LABELS: Record<string, string> = {
  max_hp:     '最大HP',
  max_st:     '最大ST',
  max_mp:     '最大MP',
  move_speed: '移動速度',
  max_weight: '最大重量',
  atk_delay:  '攻撃ディレイ',
  mag_delay:  '魔法ディレイ',
  atk:        '攻撃力',
  def:        '防御力',
  hit:        '命中',
  eva:        '回避',
  mag:        '魔力',
  res_fire:   '耐火属性',
  res_water:  '耐水属性',
  res_earth:  '耐地属性',
  res_wind:   '耐風属性',
  res_none:   '耐無属性',
}

// 追加効果入力欄の並び順（ゲーム内のステータス表示に合わせた3列構成）。
// 各配列が1列分で、列内は上から順に表示する。キーは BASE_STAT_LABELS と完全一致させること。
export const STAT_INPUT_COLUMNS: string[][] = [
  ['max_hp', 'max_st', 'max_mp', 'move_speed', 'max_weight', 'atk_delay', 'mag_delay'],
  ['atk', 'def', 'hit', 'eva', 'mag'],
  ['res_fire', 'res_water', 'res_earth', 'res_wind', 'res_none'],
]

export const SKILL_GROUPS: { group: string; skills: string[] }[] = [
  { group: '戦闘', skills: ['筋力', '着こなし', '攻撃回避', '生命力', '知能', '持久力', '精神力', '集中力', '呪文抵抗力'] },
  { group: '基本', skills: ['落下耐性', '水泳', '死体回収', '包帯', '自然回復', '採掘', '伐採', '収穫', '釣り', '解読'] },
  { group: '生産', skills: ['料理', '鍛冶', '醸造', '木工', '裁縫', '薬調合', '装飾細工', '複製', '栽培', '美容'] },
  { group: '熟練', skills: ['素手', '刀剣', 'こんぼう', '槍', '銃器', '弓', '盾', '投げ', '牙', '罠', 'キック', '戦闘技術', '酩酊', '物まね', '調教', '破壊魔法', '回復魔法', '強化魔法', '神秘魔法', '召喚魔法', '死の魔法', '魔法熟練', '自然調和', '暗黒命令', '取引', 'シャウト', '音楽', '盗み', 'ギャンブル', 'ﾊﾟﾌｫｰﾏﾝｽ', 'ダンス'] },
]

export const ALL_SKILLS: string[] = SKILL_GROUPS.flatMap((g) => g.skills)

// ---- マスタリ ----
// マスタリは構成スキルを全て40取得することで発動する効果で、テクニックの発動条件になることがある。
// skills の各スキル名は SKILL_GROUPS のスキル名と完全一致させること（絞り込みがスキル名で突き合わせるため）。
export interface Mastery {
  code: string
  name: string
  skills: string[]
}

export const MASTERIES: Mastery[] = [
  { code: 'WAR', name: 'ウォーリアー',         skills: ['刀剣', 'キック', '盾', '戦闘技術'] },
  { code: 'ALC', name: 'アルケミスト',         skills: ['破壊魔法', '回復魔法', '強化魔法', '神秘魔法'] },
  { code: 'FOR', name: 'フォレスター',         skills: ['弓', '自然調和', '物まね', '調教'] },
  { code: 'NEC', name: 'ネクロマンサー',       skills: ['召喚魔法', '死の魔法', '牙', '暗黒命令'] },
  { code: 'CRE', name: 'クリエイター',         skills: ['鍛冶', '木工', '伐採', '採掘'] },
  { code: 'BOM', name: '爆弾男',               skills: ['罠', '自然調和', '持久力', '物まね'] },
  { code: 'BRE', name: 'ブリーダー',           skills: ['取引', '料理', '自然調和', '調教'] },
  { code: 'TEM', name: 'テンプルナイト',       skills: ['回復魔法', '神秘魔法', 'こんぼう', '戦闘技術', '集中力'] },
  { code: 'DRU', name: 'ドルイド',             skills: ['回復魔法', '自然調和', '魔法熟練', '暗黒命令'] },
  { code: 'SAG', name: '紺碧の賢者',           skills: ['破壊魔法', '回復魔法', '強化魔法', '神秘魔法', '召喚魔法', '死の魔法'] },
  { code: 'GRE', name: 'グレート クリエイター', skills: ['鍛冶', '木工', '裁縫', '薬調合', '装飾細工', '料理', '複製', '醸造'] },
  { code: 'MER', name: '傭兵',                 skills: ['銃器', '罠', '物まね', '戦闘技術', '料理'] },
  { code: 'SAM', name: 'サムライ',             skills: ['刀剣', '戦闘技術', '攻撃回避', '筋力', '包帯', '精神力'] },
  { code: 'MIN', name: 'マイン ビショップ',     skills: ['神秘魔法', '魔法熟練', '召喚魔法', '鍛冶'] },
  { code: 'KIT', name: '厨房師',               skills: ['料理', '醸造', '呪文抵抗力'] },
  { code: 'ASS', name: 'アサシン',             skills: ['刀剣', '罠', '物まね', '投げ', '自然調和', '薬調合', '落下耐性'] },
  { code: 'SEA', name: '海戦士',               skills: ['水泳', '槍', '料理', '釣り', '取引'] },
  { code: 'BRA', name: 'ブレイブナイト',       skills: ['戦闘技術', 'こんぼう', '盾', '呪文抵抗力', '着こなし'] },
  { code: 'EVI', name: 'イビルナイト',         skills: ['刀剣', '牙', '死体回収', '死の魔法'] },
  { code: 'COS', name: 'コスプレイヤー',       skills: ['装飾細工', '裁縫', '着こなし', '物まね', '攻撃回避', 'ﾊﾟﾌｫｰﾏﾝｽ'] },
  { code: 'DAB', name: '物好き',               skills: ['水泳', '収穫', '酩酊', '落下耐性', '死体回収', 'ﾊﾟﾌｫｰﾏﾝｽ'] },
  { code: 'ATH', name: 'アスリート',           skills: ['落下耐性', '水泳', '自然回復', '自然調和'] },
  { code: 'DKF', name: '酔拳士',               skills: ['素手', 'キック', '酩酊', '攻撃回避', '持久力'] },
  { code: 'ROW', name: '荒くれ者',             skills: ['素手', 'キック', '落下耐性', '生命力', '自然回復', 'ﾊﾟﾌｫｰﾏﾝｽ'] },
  { code: 'IDL', name: '新人アイドル',         skills: ['ダンス', '音楽', '水泳', 'ﾊﾟﾌｫｰﾏﾝｽ'] },
  { code: 'HOU', name: 'ハウスキーパー',       skills: ['料理', '裁縫', '美容'] },
  { code: 'ADV', name: 'アドベンチャラー',     skills: ['落下耐性', '水泳', '採掘', '解読', '盗み'] },
  { code: 'SPY', name: 'スパイ',               skills: ['物まね', '投げ', '盗み'] },
  { code: 'YAN', name: 'チンピラ/レディース',   skills: ['こんぼう', '取引', '盗み', '酩酊'] },
  { code: 'BBD', name: 'ブラッドバード',       skills: ['シャウト', '持久力', '牙', '音楽'] },
  { code: 'DUE', name: 'デュエリスト',         skills: ['槍', '筋力', '着こなし', '自然回復', 'シャウト'] },
  { code: 'COL', name: 'コレクター',           skills: ['採掘', '伐採', '収穫', '釣り', '栽培'] },
  { code: 'ELM', name: 'エレメンタルナイト',   skills: ['槍', '強化魔法', '召喚魔法', '攻撃回避'] },
]

export const MASTERY_BY_CODE: Record<string, Mastery> =
  Object.fromEntries(MASTERIES.map((m) => [m.code, m]))

// ---- アセット ----
export const ASSET_PLACEMENTS: AssetPlacement[] = ['床', '壁', '天井']
export const ASSET_FUNCTIONS: AssetFunction[] = ['販売員', '銀行', 'タイプカプセル', '栽培', '生産施設', 'カタログ']
