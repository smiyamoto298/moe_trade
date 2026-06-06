import type { TradeType, Server } from '../types'

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
  '最大HP', '最大ST', '最大MP', '命中力', '回避',
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

export const BASE_STAT_LABELS: Record<string, string> = {
  atk:        '攻撃力',
  mag:        '魔力',
  atk_delay:  '攻撃ディレイ',
  mag_delay:  '魔法ディレイ',
  max_hp:     '最大HP',
  max_st:     '最大ST',
  max_mp:     '最大MP',
  hit:        '命中力',
  eva:        '回避',
  res_fire:   '耐火属性',
  res_earth:  '耐地属性',
  res_water:  '耐水属性',
  res_wind:   '耐風属性',
  res_none:   '耐無属性',
  max_weight: '最大重量',
  move_speed: '移動速度',
}

export const SKILL_GROUPS: { group: string; skills: string[] }[] = [
  { group: '戦闘', skills: ['筋力', '着こなし', '攻撃回避', '生命力', '知能', '持久力', '精神力', '集中力', '呪文抵抗力'] },
  { group: '基本', skills: ['落下耐性', '水泳', '死体回収', '包帯', '自然回復', '採掘', '伐採', '収穫', '釣り', '解読'] },
  { group: '生産', skills: ['料理', '鍛冶', '醸造', '木工', '裁縫', '薬調合', '装飾細工', '複製', '栽培', '美容'] },
  { group: '熟練', skills: ['素手', '刀剣', 'こんぼう', '槍', '銃器', '弓', '盾', '投げ', '牙', '罠', 'キック', '戦闘技術', '酩酊', '物まね', '調教', '破壊魔法', '回復魔法', '強化魔法', '神秘魔法', '召喚魔法', '死の魔法', '魔法熟練', '自然調和', '暗黒命令', '取引', 'シャウト', '音楽', '盗み', 'ギャンブル', 'ﾊﾟﾌｫｰﾏﾝｽ', 'ダンス'] },
]

export const ALL_SKILLS: string[] = SKILL_GROUPS.flatMap((g) => g.skills)
