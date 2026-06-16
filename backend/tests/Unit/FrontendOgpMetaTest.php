<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * frontend/index.html の OGP / Twitter Card メタタグの回帰防止。
 * SPA のためクローラーは JS を実行せず、静的 HTML に直接タグが必要（design.md「レイアウト・ブランド表示」参照）。
 */
class FrontendOgpMetaTest extends TestCase
{
    private function indexHtml(): string
    {
        // php コンテナには backend のみマウントされるため、frontend が見えない環境ではスキップ
        // （CI はリポジトリ全体をチェックアウトした上で実行するので必ず検証される）
        $path = base_path('../frontend/index.html');
        if (! is_file($path)) {
            $this->markTestSkipped('frontend/index.html がこの環境からは参照できない');
        }

        return file_get_contents($path);
    }

    public function test_OGPの必須タグが含まれる(): void
    {
        $html = $this->indexHtml();

        $this->assertStringContainsString('property="og:title"', $html);
        $this->assertStringContainsString('property="og:description"', $html);
        $this->assertStringContainsString('property="og:type" content="website"', $html);
        $this->assertStringContainsString('property="og:url"', $html);
        $this->assertStringContainsString('property="og:image"', $html);
    }

    public function test_TwitterCardはsummary_large_imageで画像タグを持つ(): void
    {
        $html = $this->indexHtml();

        $this->assertStringContainsString('name="twitter:card" content="summary_large_image"', $html);
        $this->assertStringContainsString('name="twitter:image"', $html);
    }

    public function test_og_imageとtwitter_imageは本番ドメインの絶対URL(): void
    {
        $html = $this->indexHtml();

        preg_match_all(
            '/(?:property="og:image"|name="twitter:image") content="([^"]+)"/',
            $html,
            $matches
        );

        $this->assertNotEmpty($matches[1]);
        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('https://moe-trade.sakuraweb.com/', $url);
        }
    }

    public function test_ゲーム名の表記ゆれをタイトルと説明に含む(): void
    {
        // 日本のプレイヤーはカタカナ「マスターオブエピック」で検索することが多いため、
        // 英語表記だけでなくカタカナ表記もメタに含めてブランド系検索を取りこぼさない
        // （SNSクローラーは JS 非実行のため、静的 index.html に直接含める必要がある）。
        $html = $this->indexHtml();

        $this->assertStringContainsString('マスターオブエピック', $html);
        $this->assertStringContainsString('Master of Epic', $html);
    }

    public function test_og_imageが指すファイルはリポジトリに存在する(): void
    {
        $html = $this->indexHtml();

        preg_match('/property="og:image" content="https:\/\/[^\/]+(\/[^"]+)"/', $html, $m);
        $this->assertNotEmpty($m, 'og:image タグが見つからない');

        $this->assertFileExists(base_path('../frontend/public' . $m[1]));
    }
}
