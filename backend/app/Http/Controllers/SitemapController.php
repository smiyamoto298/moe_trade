<?php

namespace App\Http\Controllers;

use App\Models\BuyRequest;
use App\Models\Listing;

/**
 * 検索エンジン向けサイトマップ（GET /sitemap.xml）。
 *
 * SPA のためクローラーは出品・買取の詳細URLをリンクから発見しづらい。
 * 出品中（active）の出品・買取の詳細ページと主要な一覧ページを列挙して
 * Google 等にインデックスさせる（robots.txt から参照される）。
 */
class SitemapController extends Controller
{
    public function __invoke()
    {
        $base = rtrim(config('app.frontend_url'), '/');

        $urls = [
            ['loc' => $base . '/listings'],
            ['loc' => $base . '/skills'],
            ['loc' => $base . '/assets'],
            ['loc' => $base . '/buy-requests'],
        ];

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
