<?php

namespace App\Support;

/**
 * X（旧Twitter）向けの宣伝ツイート文面を生成する。
 *
 * 未認証アカウントの上限（重み280＝全角140字相当。CJK等は2、半角英数は1、
 * URLは t.co 短縮により一律23としてカウント）に収まるよう、アイテムが多い場合は
 * 複数ツイートへ自動分割し、全アイテムを漏れなく掲載する。
 * アイテムは出品「売)」・買取「買)」のプレフィックス付きで1つのリストにまとめる。
 * 分割時は本文末尾に「...続く」を付け、続きツイートは「（続き）」の行で始める。
 *
 * DBや外部APIに依存しない純粋クラス（ユニットテスト対象）。
 */
class PromoTweetComposer
{
    /** 1ツイートの上限（重み付き文字数） */
    public const WEIGHT_LIMIT = 280;

    /** URLは長さによらず t.co 短縮で23文字としてカウントされる */
    public const URL_WEIGHT = 23;

    public const SECTION_TRADES = '【本日の取引成立】';
    public const SECTION_ITEMS  = '【新規の取引】';

    // 現在有効な出品・買取の登録総数（期間に依存しないスナップショット）
    public const SECTION_REGISTERED = '【現在の登録数】';

    // 期間（累計）モード用の見出し
    public const SECTION_TRADES_RANGE = '【期間中の取引成立数】';

    public const HASHTAGS = '#MasterofEpic #MoETrade';

    /**
     * @param string $dateLabel 「6/12」（単日）または「6/8〜6/12」（期間）のような日付表示
     * @param array<int, array{name: string, price: int, currency: string, count: int, negotiable?: bool}> $listings
     * @param array<int, array{name: string, price: int, currency: string, count: int, negotiable?: bool}> $buyRequests
     * @param int $tradeCount 取引成立件数
     * @param int $activeListingCount 現在有効な出品の総数
     * @param int $activeBuyRequestCount 現在有効な買取の総数
     * @param string $siteUrl 各ツイート末尾に付けるサイトURL
     * @param bool $cumulative true なら期間（累計）モードの見出し（【期間中の〜】）を使う
     * @return string[] ツイート文面（投稿順）
     */
    public function compose(
        string $dateLabel,
        array $listings,
        array $buyRequests,
        int $tradeCount,
        int $activeListingCount,
        int $activeBuyRequestCount,
        string $siteUrl,
        bool $cumulative = false,
        string $hashtags = self::HASHTAGS
    ): array {
        // フッターは1通目のみハッシュタグ＋URL、2通目以降は1通目への返信として
        // 投稿する前提のためハッシュタグのみ（サイトリンクは付けない）。
        // 続きがあるツイートは本文末尾に「...続く」を付けるため、その分（改行込み）を常に確保しておく。
        $ellipsisReserve = self::weight("\n...続く");
        $budgetFor = function (int $tweetIndex) use ($hashtags, $ellipsisReserve): int {
            $footerWeight = 1 + self::weight($hashtags)
                + ($tweetIndex === 0 ? 1 + self::URL_WEIGHT : 0);
            return self::WEIGHT_LIMIT - $footerWeight - $ellipsisReserve;
        };

        $tradesHeader = $cumulative ? self::SECTION_TRADES_RANGE : self::SECTION_TRADES;

        $tweets  = [];
        $current = [
            "📢MoE Trade（{$dateLabel}）",
            $tradesHeader . "{$tradeCount}件",
            self::SECTION_REGISTERED . "出品{$activeListingCount}件:買取{$activeBuyRequestCount}件",
        ];

        // 現在のツイートに行を追加できるか（改行1文字分を含めて）判定する
        $fits = function (array $lines, string ...$more) use (&$tweets, $budgetFor): bool {
            return self::weight(implode("\n", array_merge($lines, $more))) <= $budgetFor(count($tweets));
        };
        // $hasMore: 続きのツイートがある場合は本文末尾に「...続く」を付ける
        $flush = function (bool $hasMore = false) use (&$tweets, &$current): void {
            if ($current !== []) {
                if ($hasMore) {
                    $current[] = '...続く';
                }
                $tweets[] = implode("\n", $current);
                $current  = [];
            }
        };

        // 出品は「売)」・買取は「買)」のプレフィックス付きで1つのリストにまとめる
        $lines = array_merge(
            array_map(fn (array $item) => self::itemLine($item, '売)'), $listings),
            array_map(fn (array $item) => self::itemLine($item, '買)'), $buyRequests),
        );
        if ($lines === []) {
            $lines = ['新着の出品・買取はなし'];
        }

        // 見出しがツイート末尾に孤立しないよう、最初の1行とセットで入るか確認する
        if (!$fits($current, self::SECTION_ITEMS, $lines[0])) {
            $flush(hasMore: true);
        }
        $current[] = self::SECTION_ITEMS;
        $afterHeader = true; // 見出し直後の分割を防ぐ（見出しだけのツイートを作らない）

        foreach ($lines as $line) {
            if (!$fits($current, $line) && !$afterHeader) {
                $flush(hasMore: true);
                $current[] = '（続き）';
            }
            // 1行単独でも収まらない異常に長い行（長いアイテム名等）は切り詰める
            if (!$fits($current, $line)) {
                $prefix = implode("\n", $current) . "\n";
                $line = self::truncateToWeight($line, $budgetFor(count($tweets)) - self::weight($prefix));
            }
            $current[] = $line;
            $afterHeader = false;
        }

        $flush();

        // 1通目のみサイトURLを付ける（2通目以降は1通目への返信として投稿する）
        return array_map(
            fn (string $body, int $i) => $body . "\n" . $hashtags . ($i === 0 ? "\n" . $siteUrl : ''),
            $tweets,
            array_keys($tweets)
        );
    }

    /**
     * 「売)アイテム名 12,000AC:交渉可 ×3」形式の行を作る。
     * 交渉可（negotiable=true）のときは価格の後ろに「:交渉可」を付ける。
     */
    public static function itemLine(array $item, string $prefix = ''): string
    {
        $line = $prefix . $item['name'] . ' ' . number_format($item['price']) . ($item['currency'] ?? '');
        if (!empty($item['negotiable'])) {
            $line .= ':交渉可';
        }
        if (($item['count'] ?? 1) > 1) {
            $line .= ' ×' . $item['count'];
        }
        return $line;
    }

    /**
     * Xの重み付き文字数。URL（http/https）は一律23としてカウントする。
     */
    public static function weightedLength(string $text): int
    {
        $weight = 0;
        // URLを抜き出して23換算
        $rest = preg_replace_callback(
            '~https?://[^\s]+~u',
            function () use (&$weight) {
                $weight += self::URL_WEIGHT;
                return '';
            },
            $text
        );
        return $weight + self::weight($rest ?? $text);
    }

    /**
     * URLを含まないテキストの重み。半角英数・基本ラテン等は1、CJK・絵文字等は2。
     * （Xの twitter-text 仕様に準拠した近似。日本語は2、ASCIIは1になる）
     */
    public static function weight(string $text): int
    {
        $weight = 0;
        $len = mb_strlen($text, 'UTF-8');
        for ($i = 0; $i < $len; $i++) {
            $cp = mb_ord(mb_substr($text, $i, 1, 'UTF-8'), 'UTF-8');
            $isLight = ($cp >= 0x0000 && $cp <= 0x10FF)
                || ($cp >= 0x2000 && $cp <= 0x200D)
                || ($cp >= 0x2010 && $cp <= 0x201F)
                || ($cp >= 0x2032 && $cp <= 0x2037);
            $weight += $isLight ? 1 : 2;
        }
        return $weight;
    }

    /**
     * 重みが $maxWeight 以下になるよう末尾を「…」で切り詰める。
     */
    public static function truncateToWeight(string $text, int $maxWeight): string
    {
        if (self::weight($text) <= $maxWeight) {
            return $text;
        }
        $ellipsisWeight = self::weight('…');
        $result = '';
        $used = 0;
        $len = mb_strlen($text, 'UTF-8');
        for ($i = 0; $i < $len; $i++) {
            $ch = mb_substr($text, $i, 1, 'UTF-8');
            $w  = self::weight($ch);
            if ($used + $w + $ellipsisWeight > $maxWeight) {
                break;
            }
            $result .= $ch;
            $used += $w;
        }
        return $result . '…';
    }
}
