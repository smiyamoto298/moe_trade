<?php

namespace App\Support;

use App\Models\DismissedExcludedSuggestion;
use App\Models\ExcludedItem;
use App\Models\ExclusionType;
use App\Models\ReportedExcludedName;
use App\Models\UserExcludedItem;
use Illuminate\Support\Collection;

/**
 * ユーザーが個別に設定した種別を集計した「共通化（共通種別割当への昇格）候補」。
 *
 * 管理画面「ユーザー個別設定の共通化」の一覧（`GET /admin/excluded-items/user-suggestions`）と、
 * ヘッダー「アイテム種別管理」の通知バッジ件数（`notifications/summary` の
 * `excluded_suggestion_count`）は**必ず同じ集合**を見る必要があるため、集計をここに一元化する。
 * （かつて 2 箇所で別々に実装しており、カスタム種別の扱いが食い違って
 * 「バッジは点いているのに一覧は空」という乖離が起きた）
 */
class ExclusionSuggestions
{
    /**
     * 候補一覧を返す。2種類の候補を含む:
     *
     *  - 新規候補: まだ共通登録されていない名前。DB保存ユーザー分（user_excluded_items）は設定人数を
     *    集計し、端末（ローカルストレージ）保存ユーザー分（reported_excluded_names・匿名報告）は名前を
     *    `from_device` 付きで合流させる（端末分は人数を持たないため presence のみ）。
     *  - 上書き候補: 既に共通登録済みだが、現在の共通種別と**異なる種別**を設定したユーザーがいる名前
     *    （`current_type_id` に現在の共通種別を入れて返す）。同じ種別しか設定されていなければ候補にしない。
     *
     * 各候補には、ユーザーが設定した種別の内訳 `type_assignments`（多い順・`type_id` は null=その他）と、
     * 共通化時の既定候補 `suggested_type_id`（最頻の種別。上書き候補は現在と異なる最頻種別）を付ける。
     * 管理者が「共通にしない」と却下した名前（dismissed_excluded_suggestions）は除く。
     *
     * ユーザー独自のカスタム種別（`user_exclusion_type_id` が非 null）への割当は、共通種別の内訳として
     * 意味を持たないため集計対象外（`exclusion_type_id=null` のカスタム割当を「その他」に誤計上しない）。
     *
     * @return Collection<int, array{name: string, user_count: int, from_device: bool, current_type_id: ?int, suggested_type_id: ?int, type_assignments: list<array{type_id: ?int, count: int}>}>
     *         user_count 降順 → name 昇順
     */
    public static function rows(): Collection
    {
        $defaultId = ExclusionType::default()?->id;
        $dismissed = DismissedExcludedSuggestion::pluck('name')->flip();

        // 共通の種別割当（name → 現在の共通種別ID。null は既定種別へ正規化）
        $common = ExcludedItem::get(['name', 'exclusion_type_id'])
            ->mapWithKeys(fn ($i) => [$i->name => $i->exclusion_type_id ?? $defaultId]);

        // DB保存ユーザーの個別割当を name×種別 で人数集計（unique(user_id,name) のため 1ユーザー1名1種別）
        $dbAgg = UserExcludedItem::query()
            ->whereNull('user_exclusion_type_id')
            ->selectRaw('name, exclusion_type_id, COUNT(DISTINCT user_id) as cnt')
            ->groupBy('name', 'exclusion_type_id')
            ->get()
            ->groupBy('name');

        // 端末（ローカル）保存ユーザーの匿名報告（名前のみ）
        $deviceNames = ReportedExcludedName::pluck('name')->flip();

        $names = collect($dbAgg->keys())->merge($deviceNames->keys())->unique();

        return $names
            ->reject(fn ($name) => $dismissed->has($name))
            ->map(function ($name) use ($dbAgg, $deviceNames, $common, $defaultId) {
                $assigns = $dbAgg->get($name, collect());
                // 種別内訳（多い順）。type_id は raw（null=その他）。
                $breakdown = $assigns
                    ->map(fn ($r) => ['type_id' => $r->exclusion_type_id, 'count' => (int) $r->cnt])
                    ->sortByDesc('count')->values()->all();
                $current = $common->has($name) ? $common[$name] : null;

                if ($current === null) {
                    // 新規候補: DB割当か端末報告があれば候補
                    $userCount = (int) $assigns->sum('cnt');
                    if ($userCount === 0 && !$deviceNames->has($name)) {
                        return null;
                    }
                    $suggested = $assigns->whereNotNull('exclusion_type_id')
                        ->sortByDesc('cnt')->first()?->exclusion_type_id;
                    return [
                        'name'              => $name,
                        'user_count'        => $userCount,
                        'from_device'       => $deviceNames->has($name),
                        'current_type_id'   => null,
                        'suggested_type_id' => $suggested,
                        'type_assignments'  => $breakdown,
                    ];
                }

                // 上書き候補: 既に共通登録済み。現在の共通種別と異なる種別を設定したユーザーがいる場合のみ。
                $overriders = $assigns->filter(fn ($r) => ($r->exclusion_type_id ?? $defaultId) !== $current);
                if ($overriders->isEmpty()) {
                    return null;
                }
                // 最頻の上書き種別（null=その他は既定種別IDへ正規化して具体IDで返す）
                $top = $overriders->sortByDesc('cnt')->first();
                return [
                    'name'              => $name,
                    'user_count'        => (int) $overriders->sum('cnt'),
                    'from_device'       => false,
                    'current_type_id'   => $current,
                    'suggested_type_id' => $top->exclusion_type_id ?? $defaultId,
                    'type_assignments'  => $breakdown,
                ];
            })
            ->filter()
            // user_count 降順 → name 昇順
            ->sortBy([['user_count', 'desc'], ['name', 'asc']])
            ->values();
    }

    /**
     * 候補の件数（通知バッジ用）。新規候補・上書き候補の両方を含み、一覧の行数と必ず一致する。
     */
    public static function count(): int
    {
        return self::rows()->count();
    }
}
