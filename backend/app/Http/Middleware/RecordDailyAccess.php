<?php

namespace App\Http\Middleware;

use App\Models\UserDailyAccess;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Http\Request;

/**
 * 認証済みユーザーのアクセスを (user_id, JST日付, JSTの時) 単位で記録する。
 * 利用状況解析の「アクセス」（日次ユニークアクセスユーザー数・時間帯分布）の集計元。
 * insertOrIgnore のため同じ時間帯の2回目以降は no-op（ユニーク制約で吸収・競合安全）。
 */
class RecordDailyAccess
{
    public function handle(Request $request, Closure $next): mixed
    {
        // ルート側の auth ミドルウェアに依存せず sanctum ガードで直接解決する
        // （公開ルートでもトークン付きならアクセスとして数える）
        $user = $request->user('sanctum');

        if ($user) {
            $now = CarbonImmutable::now('Asia/Tokyo');

            UserDailyAccess::insertOrIgnore([
                'user_id' => $user->id,
                'date'    => $now->format('Y-m-d'),
                'hour'    => (int) $now->format('G'),
            ]);
        }

        return $next($request);
    }
}
