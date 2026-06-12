<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * frontend/public/robots.txt の回帰防止。
 * sitemap.xml の場所をクローラーに知らせ、出品中・買取中のアイテムページを
 * 検索エンジンにインデックスさせるための要（design.md「SEO」参照）。
 */
class RobotsTxtTest extends TestCase
{
    private function robotsTxt(): string
    {
        // php コンテナには backend のみマウントされるため、frontend が見えない環境ではスキップ
        // （CI はリポジトリ全体をチェックアウトした上で実行するので必ず検証される）
        $path = base_path('../frontend/public/robots.txt');
        if (! is_file($path)) {
            $this->markTestSkipped('frontend/public/robots.txt がこの環境からは参照できない');
        }

        return file_get_contents($path);
    }

    public function test_サイトマップの絶対URLを宣言している(): void
    {
        $this->assertStringContainsString(
            'Sitemap: https://moe-trade.sakuraweb.com/sitemap.xml',
            $this->robotsTxt()
        );
    }

    public function test_公開ページはブロックせず非公開系のみDisallowする(): void
    {
        $txt = $this->robotsTxt();

        // 出品・買取ページがクロールできること（全体 Disallow になっていないこと）
        $this->assertStringNotContainsString("Disallow: /\n", $txt);
        $this->assertStringNotContainsString('Disallow: /listings', $txt);
        $this->assertStringNotContainsString('Disallow: /buy-requests', $txt);

        // ログイン必須・管理系はクロール対象外
        $this->assertStringContainsString('Disallow: /admin', $txt);
        $this->assertStringContainsString('Disallow: /mypage', $txt);
    }
}
