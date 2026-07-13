<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 出品詳細ページ（GET /listings/{id}）のサーバ側メタ注入。
 * 生HTMLの段階で固有の title/description と canonical（アイテム恒久ページへの集約）が入り、
 * 非公開（取り下げ・期限切れ）は本物の 404 を返すこと（ソフト404対策）を検証する。
 */
class ListingPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_出品中の出品は固有のメタとアイテムページへのcanonicalが注入される(): void
    {
        $base = rtrim(config('app.frontend_url'), '/');
        $item = $this->makeItem(['name' => '炎の剣']);
        $listing = $this->makeListing(null, $item);

        $res = $this->get("/listings/{$listing->id}");

        $res->assertOk();
        $res->assertHeader('Content-Type', 'text/html; charset=UTF-8');
        $html = $res->getContent();

        $this->assertStringContainsString('<title>炎の剣 の出品 | MoE Trade</title>', $html);
        // ゲーム名の表記ゆれ（カタカナ・英語）を description に含め、ブランド系検索でも拾われるようにする
        $this->assertStringContainsString('マスターオブエピック', $html);
        $this->assertStringContainsString('Master of Epic', $html);
        // canonical は使い捨ての出品URLでなくアイテム恒久ページへ集約（usePageMeta と同じマーカー）
        $this->assertStringContainsString('rel="canonical" data-page-canonical href="' . $base . '/items/' . $item->id . '"', $html);
        // og:url は共有用にこのページ自身のURL
        $this->assertStringContainsString('property="og:url" content="' . $base . '/listings/' . $listing->id . '"', $html);
    }

    public function test_取引成立済みの出品も閲覧できメタが注入される(): void
    {
        $listing = $this->makeListing(null, $this->makeItem(['name' => '成立の剣']), ['status' => 'completed']);

        $html = $this->get("/listings/{$listing->id}")->assertOk()->getContent();

        $this->assertStringContainsString('<title>成立の剣 の出品 | MoE Trade</title>', $html);
    }

    public function test_取り下げた出品は404でSPAシェルを返す(): void
    {
        $listing = $this->makeListing(null, null, ['status' => 'cancelled']);

        $res = $this->get("/listings/{$listing->id}");

        $res->assertStatus(404);
        $res->assertHeader('Content-Type', 'text/html; charset=UTF-8');
        $this->assertStringContainsString('<div id="root">', $res->getContent());
    }

    public function test_バッチ未実行でactiveのまま期限超過した出品も404を返す(): void
    {
        $listing = $this->makeListing(null, null, ['expires_at' => now()->subDay()]);

        $this->get("/listings/{$listing->id}")->assertStatus(404);
    }

    public function test_存在しない出品は404でSPAシェルを返す(): void
    {
        $this->get('/listings/999999')->assertStatus(404);
    }

    public function test_アイテム名のマークアップはエスケープされる(): void
    {
        // ユーザー投稿由来のアイテム名に悪意あるマークアップが入っても素のまま出さない
        $item = $this->makeItem(['name' => '剣"><script>alert(1)</script>', 'verified_status' => 'unverified']);
        $listing = $this->makeListing(null, $item);

        $html = $this->get("/listings/{$listing->id}")->getContent();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $html);
    }
}
