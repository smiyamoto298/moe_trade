import type { Item } from '../types'
import { BASE_STAT_LABELS, SPECIAL_CONDITIONS, formatSignedValue } from '../utils/constants'
import EquipmentSetBreakdown from './EquipmentSetBreakdown'

/**
 * アイテムの基本情報カード（カテゴリ・名前・説明・装備セット内訳・アセット情報・
 * 追加効果・付加効果・特殊条件）。出品詳細・買取詳細・アイテム詳細ページで共通利用する。
 *
 * 確認バッジ（UnverifiedBadge）や取引情報はページ固有なので呼び出し側で表示する。
 */
export default function ItemInfoCard({ item, tourId }: { item: Item; tourId?: string }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6">
      <p className="text-sm text-gray-400 mb-1">{item.category.name}</p>
      <h1 data-tour={tourId} className="text-2xl font-bold text-white mb-4">{item.name}</h1>

      {item.description && (
        <p className="text-sm text-gray-300 mb-4">{item.description}</p>
      )}

      {/* 装備セット内訳（部位ごとの名前・追加効果・付加効果） */}
      {item.is_equipment_set && <EquipmentSetBreakdown members={item.set_members} />}

      {/* アセット情報 */}
      {(item.placement || (item.asset_width && item.asset_height) || (item.storage_count ?? 0) > 0 || item.special_function) && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">アセット情報</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {item.placement && (
              <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                <span className="text-gray-400">設置個所</span>
                <span className="text-white font-medium">{item.placement}</span>
              </div>
            )}
            {item.asset_width && item.asset_height ? (
              <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                <span className="text-gray-400">サイズ</span>
                <span className="text-white font-medium">{item.asset_width}×{item.asset_height}</span>
              </div>
            ) : null}
            {(item.storage_count ?? 0) > 0 && (
              <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                <span className="text-gray-400">ストレージ</span>
                <span className="text-white font-medium">{item.storage_count}</span>
              </div>
            )}
            {item.special_function && (
              <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                <span className="text-gray-400">特殊機能</span>
                <span className="text-white font-medium">{item.special_function}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 装備セットはセット本体の性能（古いデータ）は無視し、セット内訳の部位ごとの性能のみ表示する */}
      {!item.is_equipment_set && Object.keys(item.base_stats).length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">追加効果</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(item.base_stats).map(([key, val]) => (
              <div key={key} className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                <span className="text-gray-400">{BASE_STAT_LABELS[key] ?? key}</span>
                <span className="text-white font-medium">{formatSignedValue(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!item.is_equipment_set && item.bonus_effects.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">付加効果</h2>
          <div className="space-y-1">
            {item.bonus_effects.map((e) => (
              <div key={e.id} className="bg-surface rounded px-3 py-2 text-sm">
                <span className="text-primary-500 font-medium">{e.effect_name}</span>
                {e.is_exclusive && (
                  <span className="ml-1.5 text-[10px] bg-amber-900/40 border border-amber-600/40 rounded px-1 py-px text-amber-200">専用技</span>
                )}
                {e.values.length > 0 && (
                  <span className="text-gray-300 ml-2">
                    {e.values.map((v, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-gray-600 mx-1">/</span>}
                        {v.label && <span className="text-gray-400">{v.label} </span>}
                        <span>{formatSignedValue(v.value, v.value_unit)}{v.value_unit === '%' ? '%' : v.value_unit === 'x' ? '倍' : v.value_unit === 'per_min' ? '/min' : ''}</span>
                      </span>
                    ))}
                  </span>
                )}
                {e.description && (
                  <span className="text-gray-500 ml-2 text-xs">— {e.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!item.is_equipment_set && item.special_conditions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.special_conditions.map((c) => (
            <span
              key={c}
              title={SPECIAL_CONDITIONS[c]}
              className="bg-red-900/40 border border-red-700/50 text-red-300 text-xs px-2 py-0.5 rounded"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
