<?php

namespace Tests\Unit;

use App\Support\OfficialUrl;
use PHPUnit\Framework\TestCase;

class OfficialUrlTest extends TestCase
{
    public function test_javascriptMove形式をhidden_key付きURLへ変換する(): void
    {
        $this->assertSame(
            'https://moepic.com/top/news_detail.php?hidden_key=43ddbb90e533',
            OfficialUrl::normalize("javascript:Move('https://moepic.com/top/news_detail.php','43ddbb90e533')")
        );
    }

    public function test_ダブルクォート_前後空白_末尾セミコロンも受け付ける(): void
    {
        $this->assertSame(
            'https://moepic.com/x.php?hidden_key=abc',
            OfficialUrl::normalize('  javascript:Move("https://moepic.com/x.php", "abc") ;  ')
        );
    }

    public function test_既にクエリがあるURLはアンパサンドで連結する(): void
    {
        $this->assertSame(
            'https://moepic.com/x.php?a=1&hidden_key=k',
            OfficialUrl::normalize("javascript:Move('https://moepic.com/x.php?a=1','k')")
        );
    }

    public function test_キーが空ならURLだけを返す(): void
    {
        $this->assertSame(
            'https://moepic.com/x.php',
            OfficialUrl::normalize("javascript:Move('https://moepic.com/x.php','')")
        );
    }

    public function test_キーはURLエンコードされる(): void
    {
        $this->assertSame(
            'https://moepic.com/x.php?hidden_key=a%26b%3Dc',
            OfficialUrl::normalize("javascript:Move('https://moepic.com/x.php','a&b=c')")
        );
    }

    public function test_ルート相対パスは公式サイトのオリジンで解決する(): void
    {
        $this->assertSame(
            'https://moepic.com/top/news_detail.php?hidden_key=167cd417',
            OfficialUrl::normalize("javascript:Move('/top/news_detail.php','167cd417')")
        );
    }

    public function test_プロトコル相対はhttpsで解決する(): void
    {
        $this->assertSame(
            'https://moepic.com/x.php?hidden_key=k',
            OfficialUrl::normalize("javascript:Move('//moepic.com/x.php','k')")
        );
    }

    public function test_ディレクトリ相対パスのMoveは変換せずそのまま返す(): void
    {
        // 元ページが分からず解決できないため変換しない（後段のURLバリデーションで拒否される）
        $input = "javascript:Move('news_detail.php','abc')";
        $this->assertSame($input, OfficialUrl::normalize($input));
    }

    public function test_通常のURLやnullはそのまま返す(): void
    {
        $this->assertSame('http://moepic.com/db/item/1', OfficialUrl::normalize('http://moepic.com/db/item/1'));
        $this->assertSame('javascript:alert(1)', OfficialUrl::normalize('javascript:alert(1)'));
        $this->assertNull(OfficialUrl::normalize(null));
    }
}
