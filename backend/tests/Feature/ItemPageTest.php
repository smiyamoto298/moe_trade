<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * アイテム恒久ページ（GET /items/{id}）のサーバ側メタ注入。
 * クローラーが生HTMLの段階でアイテムを区別できるよう、固有の title/description/
 * canonical/Product JSON-LD（未確認は noindex）が入ることを検証する。
 */
class ItemPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_確認済みアイテムは固有のメタとcanonicalとJSONLDが注入される(): void
    {
        $base = rtrim(config('app.frontend_url'), '/');
        $item = $this->makeItem(['name' => '炎の剣', 'verified_status' => 'verified']);

        $res = $this->get("/items/{$item->id}");

        $res->assertOk();
        $res->assertHeader('Content-Type', 'text/html; charset=UTF-8');
        $html = $res->getContent();

        $this->assertStringContainsString('<title>炎の剣 の相場・出品 | MoE Trade</title>', $html);
        $this->assertStringContainsString('炎の剣', $html);
        // ゲーム名の表記ゆれ（カタカナ・英語）を description に含め、ブランド系検索でも拾われるようにする
        $this->assertStringContainsString('マスターオブエピック', $html);
        $this->assertStringContainsString('Master of Epic', $html);
        // canonical はアイテム自URL。usePageMeta と同じマーカーで二重化を防ぐ
        $this->assertStringContainsString('rel="canonical" data-page-canonical href="' . $base . '/items/' . $item->id . '"', $html);
        // Product JSON-LD
        $this->assertStringContainsString('application/ld+json', $html);
        $this->assertStringContainsString('"@type":"Product"', $html);
        $this->assertStringContainsString('"name":"炎の剣"', $html);
        // 確認済みは noindex を付けない
        $this->assertStringNotContainsString('name="robots" data-page-robots', $html);
    }

    public function test_未確認アイテムはnoindexが注入される(): void
    {
        $item = $this->makeItem(['name' => '未確認の剣', 'verified_status' => 'unverified']);

        $html = $this->get("/items/{$item->id}")->getContent();

        $this->assertStringContainsString('name="robots" data-page-robots content="noindex"', $html);
    }

    public function test_存在しないアイテムは404でSPAシェルを返す(): void
    {
        $res = $this->get('/items/999999');

        $res->assertStatus(404);
        $res->assertHeader('Content-Type', 'text/html; charset=UTF-8');
        $this->assertStringContainsString('<div id="root">', $res->getContent());
    }

    public function test_アイテム名のscriptタグはJSONLDへエスケープされる(): void
    {
        // ユーザー投稿（未確認）アイテム名に悪意あるマークアップが入っても素のまま出さない
        $item = $this->makeItem(['name' => '剣</script><script>alert(1)</script>', 'verified_status' => 'unverified']);

        $html = $this->get("/items/{$item->id}")->getContent();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $html);
    }
}
