// アイテムのコピー時に行う名前変更（文字置換＋末尾追加）。
// アイテム管理一覧のコピーダイアログ（プレビュー）と、コピー編集画面のフォーム複製で共有する。
export interface CopyReplacement {
  search: string  // 置換対象（空の行は無視する）
  replace: string // 置換後
}

export interface CopyRename {
  replacements: CopyReplacement[] // 上から順に適用する（前の置換結果に次の置換がかかる）
  suffix: string                  // 末尾に追加する文字列（空なら追加しない）
}

export const emptyCopyRename = (): CopyRename => ({
  replacements: [{ search: '', replace: '' }],
  suffix: '',
})

// セット名・各部位アイテム名それぞれに適用する。各置換は出現箇所すべてを置換する。
export function applyCopyRename(name: string, rename: CopyRename | null | undefined): string {
  if (!rename) return name
  const replaced = rename.replacements.reduce(
    (acc, r) => (r.search ? acc.split(r.search).join(r.replace) : acc),
    name,
  )
  return replaced + rename.suffix
}
