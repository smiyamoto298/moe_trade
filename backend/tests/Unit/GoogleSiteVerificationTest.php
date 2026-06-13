<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * frontend/public/googlec78507164cec985a.html の回帰防止。
 * Google Search Console の所有権確認ファイル。削除・改変すると
 * 所有権確認が外れるため残すこと（design.md「SEO」参照）。
 */
class GoogleSiteVerificationTest extends TestCase
{
    public function test_サイト確認ファイルが正しい内容で存在する(): void
    {
        // php コンテナには backend のみマウントされるため、frontend が見えない環境ではスキップ
        // （CI はリポジトリ全体をチェックアウトした上で実行するので必ず検証される）
        $path = base_path('../frontend/public/googlec78507164cec985a.html');
        if (! is_file($path)) {
            $this->markTestSkipped('frontend/public/googlec78507164cec985a.html がこの環境からは参照できない');
        }

        $this->assertSame(
            'google-site-verification: googlec78507164cec985a.html',
            trim(file_get_contents($path))
        );
    }
}
