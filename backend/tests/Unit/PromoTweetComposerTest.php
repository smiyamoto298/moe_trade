<?php

namespace Tests\Unit;

use App\Support\PromoTweetComposer;
use PHPUnit\Framework\TestCase;

/**
 * X宣伝ツイートの文面生成・分割ロジックのテスト。
 * DB・Laravel に依存しない純粋ロジックなので素の PHPUnit でテストする。
 */
class PromoTweetComposerTest extends TestCase
{
    private const URL = 'https://moe-trade.sakuraweb.com/listings';

    private function item(string $name, int $price = 1000, int $count = 1): array
    {
        return ['name' => $name, 'price' => $price, 'currency' => 'AC', 'count' => $count];
    }

    public function test_重み付き文字数_半角は1_全角は2(): void
    {
        $this->assertSame(3, PromoTweetComposer::weight('abc'));
        $this->assertSame(6, PromoTweetComposer::weight('あいう'));
        $this->assertSame(6, PromoTweetComposer::weight('aあbい')); // 1+2+1+2
    }

    public function test_重み付き文字数_URLは一律23換算(): void
    {
        $this->assertSame(23, PromoTweetComposer::weightedLength('https://example.com/very/long/path/that/exceeds/23'));
        // 「あ(2) + 改行(1) + URL(23)」
        $this->assertSame(26, PromoTweetComposer::weightedLength("あ\nhttps://example.com"));
    }

    public function test_少数のアイテムは1ツイートに収まり全セクションを含む(): void
    {
        $tweets = (new PromoTweetComposer())->compose(
            '6/12',
            [$this->item('剛力の剣', 12000)],
            [$this->item('守りの盾', 500)],
            3,
            42,
            17,
            self::URL
        );

        $this->assertCount(1, $tweets);
        $text = $tweets[0];
        $this->assertStringContainsString('【本日の取引成立】3件', $text);
        $this->assertStringContainsString('【現在の登録数】出品42件:買取17件', $text);
        $this->assertStringContainsString("【新規の取引】\n売)剛力の剣 12,000AC", $text);
        $this->assertStringContainsString('買)守りの盾 500AC', $text);
        $this->assertStringContainsString(self::URL, $text);
        $this->assertLessThanOrEqual(
            PromoTweetComposer::WEIGHT_LIMIT,
            PromoTweetComposer::weightedLength($text)
        );
    }

    public function test_アイテムが多い場合は分割され全アイテムが漏れなく掲載される(): void
    {
        $listings = [];
        for ($i = 1; $i <= 25; $i++) {
            $listings[] = $this->item("テストアイテム{$i}号", 123456);
        }
        $buys = [];
        for ($i = 1; $i <= 10; $i++) {
            $buys[] = $this->item("買取アイテム{$i}号", 9999);
        }

        $tweets = (new PromoTweetComposer())->compose('6/12', $listings, $buys, 5, 100, 50, self::URL);

        $this->assertGreaterThan(1, count($tweets));

        $last = count($tweets) - 1;
        foreach ($tweets as $i => $tweet) {
            // 各ツイートが文字数制限内に収まる
            $this->assertLessThanOrEqual(
                PromoTweetComposer::WEIGHT_LIMIT,
                PromoTweetComposer::weightedLength($tweet),
                "制限超過: {$tweet}"
            );
            // 共通タグ(#MoETrade)は全ツイート、ゲーム名タグ(#MasterofEpic)とURLは1通目のみ
            // （2通目以降は1通目への返信で投稿するため不要）
            $this->assertStringContainsString('#MoETrade', $tweet);
            if ($i === 0) {
                $this->assertStringContainsString('#MasterofEpic #MoETrade', $tweet);
                $this->assertStringContainsString(self::URL, $tweet);
            } else {
                $this->assertStringNotContainsString('#MasterofEpic', $tweet);
                $this->assertStringNotContainsString(self::URL, $tweet);
            }

            // フッター（1通目はハッシュタグ＋URLの2行、以降はハッシュタグ1行）を除いた本文
            $bodyLines = array_slice(explode("\n", $tweet), 0, $i === 0 ? -2 : -1);
            $lastBodyLine = end($bodyLines);

            // 続きがあるツイートは本文末尾が「...続く」、最終ツイートには付かない
            if ($i < $last) {
                $this->assertSame('...続く', $lastBodyLine, "「...続く」が無い: {$tweet}");
            } else {
                $this->assertNotSame('...続く', $lastBodyLine);
            }
        }

        // 全アイテムが売)/買)のプレフィックス付きでいずれかのツイートに含まれる
        $all = implode("\n", $tweets);
        for ($i = 1; $i <= 25; $i++) {
            $this->assertStringContainsString("売)テストアイテム{$i}号", $all);
        }
        for ($i = 1; $i <= 10; $i++) {
            $this->assertStringContainsString("買)買取アイテム{$i}号", $all);
        }

        // 分割の続きツイートは「（続き）」のみの行で始まる
        $this->assertStringContainsString("\n（続き）\n", "\n" . $tweets[1]);

        // 【新規の取引】見出しは1通目にあり、ツイート末尾（...続くの直前）に孤立しない
        $this->assertStringContainsString('【新規の取引】', $tweets[0]);
        $this->assertStringNotContainsString("【新規の取引】\n...続く", $all);
    }

    public function test_同一アイテムの複数出品は個数表示になる(): void
    {
        $tweets = (new PromoTweetComposer())->compose(
            '6/12',
            [$this->item('量産の矢', 100, 3)],
            [],
            0,
            0,
            0,
            self::URL
        );

        $this->assertStringContainsString('売)量産の矢 100AC ×3', $tweets[0]);
    }

    public function test_交渉可は価格の後ろに交渉可が付き即決は付かない(): void
    {
        $negotiable = $this->item('剛力の剣', 12000) + ['negotiable' => true];
        $tweets = (new PromoTweetComposer())->compose(
            '6/12',
            [$negotiable, $this->item('守りの盾', 500)],
            [$this->item('量産の矢', 100, 3) + ['negotiable' => true]],
            0,
            0,
            0,
            self::URL
        );

        $text = $tweets[0];
        // 交渉可: 価格の後ろに「:交渉可」
        $this->assertStringContainsString('売)剛力の剣 12,000AC:交渉可', $text);
        // 即決: 付かない
        $this->assertStringContainsString('売)守りの盾 500AC', $text);
        $this->assertStringNotContainsString('守りの盾 500AC:交渉可', $text);
        // 交渉可は個数表示の前に付く
        $this->assertStringContainsString('買)量産の矢 100AC:交渉可 ×3', $text);
    }

    public function test_出品も買取も無い場合は「なし」と表示される(): void
    {
        $tweets = (new PromoTweetComposer())->compose('6/12', [], [], 0, 0, 0, self::URL);

        $this->assertCount(1, $tweets);
        $this->assertStringContainsString('【本日の取引成立】0件', $tweets[0]);
        $this->assertStringContainsString('【現在の登録数】出品0件:買取0件', $tweets[0]);
        $this->assertStringContainsString("【新規の取引】\n新着の出品・買取はなし", $tweets[0]);
    }

    public function test_期間モードでは見出しが期間中表記になる(): void
    {
        $tweets = (new PromoTweetComposer())->compose(
            '6/8〜6/12',
            [$this->item('剛力の剣', 12000)],
            [$this->item('守りの盾', 500)],
            7,
            42,
            17,
            self::URL,
            cumulative: true
        );

        $text = $tweets[0];
        $this->assertStringContainsString('📢MoE Trade（6/8〜6/12）', $text);
        $this->assertStringContainsString('【期間中の取引成立数】7件', $text);
        $this->assertStringContainsString('【現在の登録数】出品42件:買取17件', $text);
        $this->assertStringContainsString('【新規の取引】', $text);
        $this->assertStringContainsString('売)剛力の剣 12,000AC', $text);
        $this->assertStringContainsString('買)守りの盾 500AC', $text);
        $this->assertStringNotContainsString('本日', $text);
    }

    public function test_極端に長いアイテム名は切り詰められ制限を超えない(): void
    {
        $longName = str_repeat('長', 300);
        $tweets = (new PromoTweetComposer())->compose(
            '6/12',
            [$this->item($longName, 100)],
            [],
            0,
            0,
            0,
            self::URL
        );

        $all = implode("\n", $tweets);
        $this->assertStringContainsString('…', $all);
        foreach ($tweets as $tweet) {
            $this->assertLessThanOrEqual(
                PromoTweetComposer::WEIGHT_LIMIT,
                PromoTweetComposer::weightedLength($tweet)
            );
        }
    }
}
