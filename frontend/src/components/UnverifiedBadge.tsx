export default function UnverifiedBadge() {
  return (
    <div className="flex items-start gap-2 bg-yellow-900/40 border border-yellow-600/50 rounded-md px-3 py-2 text-sm text-yellow-300">
      <span className="mt-0.5">⚠</span>
      <span>
        このアイテム情報はユーザーが登録したもので、現在管理者が確認中です。
        内容が正確でない場合があります。
      </span>
    </div>
  )
}
