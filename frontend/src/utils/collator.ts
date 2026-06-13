// 日本語ロケール（あいうえお順）の共有コレーター。
//
// `str.localeCompare(other, 'ja')` はロケール指定付きだと比較のたびに ICU 照合器を
// 生成するため非常に遅く、数百件のソートで数秒のメインスレッド・ブロックを招く
// （MDN も大量ソートでは Intl.Collator の使い回しを推奨）。
// 照合器を一度だけ生成して使い回すことで、同じ並び順のまま大幅に高速化する。
const jaCollator = new Intl.Collator('ja')

/** あいうえお順（日本語ロケール）の比較関数。`Array.prototype.sort` にそのまま渡せる。 */
export const compareJa = (a: string, b: string): number => jaCollator.compare(a, b)
