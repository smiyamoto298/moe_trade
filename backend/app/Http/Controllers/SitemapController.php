<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\Item;
use App\Models\Listing;

/**
 * 検索エンジン向けサイトマップ（GET /sitemap.xml）。
 *
 * SPA のためクローラーは詳細URLをリンクから発見しづらい。主要な一覧ページに加え、
 * 検索のランディング先となる詳細ページを列挙して Google 等にインデックスさせる
 * （robots.txt から参照される）。列挙する詳細ページは次の3種:
 *   - 確認済み（verified）アイテムの恒久ページ /items/{id}
 *     … アイテム名で検索したときの正規ページ。出品の有無に関わらず常に存在し、
 *       出品中の使い捨てURLと違って被リンク・クロール履歴が1URLに蓄積する。
 *   - 出品中（active）の出品詳細 /listings/{id}
 *   - 買取中（active）の買取詳細 /buy-requests/{id}
 */
class SitemapController extends Controller
{
    public function __invoke()
    {
        $base = rtrim(config('app.frontend_url'), '/');

        $urls = [
            ['loc' => $base . '/'],
            ['loc' => $base . '/listings'],
            ['loc' => $base . '/skills'],
            ['loc' => $base . '/assets'],
            ['loc' => $base . '/items'],
            ['loc' => $base . '/buy-requests'],
        ];

        // 確認済みアイテムの恒久ページ。未確認（unverified）はユーザー投稿の精査前のため含めない
        foreach (Item::where('verified_status', 'verified')->orderBy('id')->get(['id', 'updated_at']) as $item) {
            $urls[] = [
                'loc'     => "{$base}/items/{$item->id}",
                'lastmod' => $item->updated_at?->toAtomString(),
            ];
        }

        // 出品中の出品詳細。取り下げ・期限切れ等は詳細APIが404を返すため含めない
        foreach (Listing::where('status', 'active')->orderBy('id')->get(['id', 'updated_at']) as $listing) {
            $urls[] = [
                'loc'     => "{$base}/listings/{$listing->id}",
                'lastmod' => $listing->updated_at?->toAtomString(),
            ];
        }

        // 買取中の買取詳細
        foreach (BuyRequest::where('status', 'active')->orderBy('id')->get(['id', 'updated_at']) as $buyRequest) {
            $urls[] = [
                'loc'     => "{$base}/buy-requests/{$buyRequest->id}",
                'lastmod' => $buyRequest->updated_at?->toAtomString(),
            ];
        }

        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($urls as $url) {
            $xml .= '  <url><loc>' . e($url['loc']) . '</loc>';
            if (!empty($url['lastmod'])) {
                $xml .= '<lastmod>' . e($url['lastmod']) . '</lastmod>';
            }
            $xml .= "</url>\n";
        }
        $xml .= "</urlset>\n";

        return response($xml, 200)->header('Content-Type', 'application/xml; charset=UTF-8');
    }
}
