import type { Item } from '../types'
import { BASE_STAT_LABELS, SPECIAL_CONDITIONS, formatSignedValue, formatBonusValueDisplay, formatBonusEffectDescription } from '../utils/constants'
import { OTHER_RECIPE } from '../utils/itemType'
import EquipmentSetBreakdown from './EquipmentSetBreakdown'
import OfficialDbLink from './OfficialDbLink'

/**
 * アイテムの基本情報カード（カテゴリ・名前・説明・装備セット内訳・アセット情報・
 * 追加効果・付加効果・特殊条件）。出品詳細・買取詳細・アイテム詳細ページで共通利用する。
 *
 * 確認バッジ（UnverifiedBadge）や取引情報はページ固有なので呼び出し側で表示する。
 */
export default function ItemInfoCard({ item, tourId }: { item: Item; tourId?: string }) {
  // レシピの必要スキル値（テクニックの同項目と区別するため、レシピ種別のみ表示する）
  const recipeSkills = item.category.name === OTHER_RECIPE
    ? Object.entries(item.skill_requirements ?? {})
    : []
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4 sm:p-6">
      <p className="text-sm text-gray-400 mb-1">{item.category.name}</p>
      <h1 data-tour={tourId} className="text-2xl font-bold text-white mb-2">{item.name}</h1>

      {item.official_url && (
        <div className="mb-4">
          <OfficialDbLink url={item.official_url} size="md" />
        </div>
      )}

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

      {/* 「その他」種別情報（未開封ペット: ペット名 / レシピ: バインダー・レシピ名・必要スキル値） */}
      {(item.pet_name || item.recipe_name || item.recipe_binder || recipeSkills.length > 0) && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{item.category.name}情報</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {item.pet_name && (
              <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                <span className="text-gray-400">ペット名</span>
                <span className="text-white font-medium">{item.pet_name}</span>
              </div>
            )}
            {item.recipe_binder && (
              <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                <span className="text-gray-400">バインダー</span>
                <span className="text-white font-medium">{item.recipe_binder}</span>
              </div>
            )}
            {item.recipe_name && (
              <div className="bg-surface rounded px-3 py-1.5 flex justify-between text-sm">
                <span className="text-gray-400">レシピ名</span>
                <span className="text-white font-medium">{item.recipe_name}</span>
              </div>
            )}
          </div>
          {recipeSkills.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">必要スキル値</p>
              <div className="flex flex-wrap gap-1">
                {recipeSkills.map(([skill, val]) => (
                  <span key={skill} className="text-xs bg-primary-500/10 border border-primary-500/30 rounded px-2 py-0.5 text-primary-300">
                    {skill}: <span className="text-white font-medium">{val}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
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
                        <span>{formatBonusValueDisplay(v.value, v.value_unit)}</span>
                      </span>
                    ))}
                  </span>
                )}
                {formatBonusEffectDescription(e) && (
                  <span className="text-gray-500 ml-2 text-xs">— {formatBonusEffectDescription(e)}</span>
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
