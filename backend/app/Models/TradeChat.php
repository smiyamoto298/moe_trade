<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * 取引チャット。
 *
 * 出品(listing)・買取(buy_request)の双方に紐づく（どちらか一方が必ずセットされる）。
 * buyer_id は「相手側＝取引希望を送ってきたユーザー」を表す。
 *   - 出品チャット: source の owner = 売り手 / buyer_id = 買い手
 *   - 買取チャット: source の owner = 買い手 / buyer_id = 売り手
 */
class TradeChat extends Model
{
    protected $fillable = ['listing_id', 'buy_request_id', 'buyer_id', 'server', 'request_ip', 'status', 'seller_completed', 'buyer_completed'];

    protected function casts(): array
    {
        return [
            'seller_completed' => 'boolean',
            'buyer_completed'  => 'boolean',
        ];
    }

    public function listing()
    {
        return $this->belongsTo(Listing::class);
    }

    public function buyRequest()
    {
        return $this->belongsTo(BuyRequest::class);
    }

    public function buyer()
    {
        return $this->belongsTo(User::class, 'buyer_id');
    }

    public function messages()
    {
        return $this->hasMany(TradeMessage::class, 'chat_id')->orderBy('created_at');
    }

    /** このチャットが買取由来かどうか。 */
    public function isBuyRequest(): bool
    {
        return $this->buy_request_id !== null;
    }

    /** 種別文字列。 */
    public function sourceType(): string
    {
        return $this->isBuyRequest() ? 'buy_request' : 'listing';
    }

    /**
     * チャットの取引対象（Listing または BuyRequest）を返す。
     * 呼び出し側で対応するリレーションを eager load しておくこと。
     */
    public function source(): ?Model
    {
        return $this->isBuyRequest() ? $this->buyRequest : $this->listing;
    }

    /** 取引対象の登録者（出品者 or 買取登録者）のユーザーID。 */
    public function ownerId(): ?int
    {
        return $this->source()?->user_id;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  順番待ち（先着順キュー）
    //
    //  同一の取引対象（listing/buy_request）に対する status='open' のチャットを
    //  created_at の先着順に並べたものを「順番待ち行列」とする。
    //    - 先頭（1番目）のみが owner の対応対象（取引成立 / 見送り）。
    //    - 2番目以降は順番待ち。owner からは匿名・操作不可（誰からの希望か分からない）。
    //  先頭を見送る（declined）と、次のチャットが繰り上がって先頭になる。
    // ─────────────────────────────────────────────────────────────────────

    /** このチャットの取引対象を指す外部キー名（listing_id / buy_request_id）。 */
    private function sourceKey(): string
    {
        return $this->isBuyRequest() ? 'buy_request_id' : 'listing_id';
    }

    /** 同一取引対象の open チャットのうち先着1番目（最古）かどうか。 */
    public function isFirstInQueue(): bool
    {
        if ($this->status !== 'open') {
            return false;
        }
        $col = $this->sourceKey();
        // 進行中の取引成立(deal)があるなら、どの取引希望も対応対象にしない（全員順番待ちのまま）。
        // 取引成立しても次の人に進まず、取引不成立になって初めて次の人に進める。
        if (self::where($col, $this->{$col})->where('status', 'deal')->exists()) {
            return false;
        }
        $firstId = self::where($col, $this->{$col})
            ->where('status', 'open')
            ->orderBy('created_at')
            ->orderBy('id')
            ->value('id');
        return $firstId === $this->id;
    }

    /** open だが先着1番目ではない（順番待ち）。owner からは匿名・操作不可。 */
    public function isWaiting(): bool
    {
        return $this->status === 'open' && !$this->isFirstInQueue();
    }

    /**
     * owner 視点：同一取引対象の全チャット（1グループ分）に順番待ち情報を付与する。
     *   - queue_position: open チャットの先着順位（1始まり）。open 以外は null。
     *   - queue_total:    その取引対象の open チャット総数（＝待ち人数）。
     *   - is_locked:      2番目以降の open（順番待ち）かどうか。true の場合は
     *                     相手情報・メッセージを伏せて誰からの希望か分からないようにする。
     */
    public static function annotateOwnerQueue(Collection $groupChats): Collection
    {
        $open = $groupChats
            ->where('status', 'open')
            ->sortBy(fn($c) => [(string) $c->created_at, $c->id])
            ->values();
        $total = $open->count();
        $position = [];
        foreach ($open as $i => $c) {
            $position[$c->id] = $i + 1;
        }

        // 進行中の取引成立(deal)があるなら、先頭を含めて全ての順番待ちをロック（非表示のまま）。
        // 取引不成立になるまで次の取引希望には進ませない。
        $hasActiveDeal = $groupChats->contains(fn($c) => $c->status === 'deal');

        foreach ($groupChats as $c) {
            $pos = $position[$c->id] ?? null;
            $c->queue_position = $pos;
            $c->queue_total = $total;
            $locked = $pos !== null && ($hasActiveDeal || $pos >= 2);
            $c->is_locked = $locked;
            if ($locked) {
                // 順番待ちは誰からの希望か分からないように相手情報を伏せる
                $c->setRelation('buyer', null);
                $c->setRelation('messages', collect());
                $c->buyer_character_name = null;
                $c->request_ip = null;
            }
        }
        return $groupChats;
    }

    /**
     * buyer 視点：自分のチャットに、取引対象の open キュー内での順番待ち情報を付与する。
     * $sourceKey は 'listing_id' か 'buy_request_id'。
     *   - queue_position: 自分の先着順位（1始まり）。open 以外は null。
     *   - queue_total:    その取引対象の open チャット総数（＝待ち人数）。
     */
    public static function annotateBuyerQueue(Collection $chats, string $sourceKey): void
    {
        $sourceIds = $chats->pluck($sourceKey)->filter()->unique()->values()->all();
        if (empty($sourceIds)) {
            return;
        }
        $allOpen = self::where('status', 'open')
            ->whereIn($sourceKey, $sourceIds)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', $sourceKey]);
        $grouped = $allOpen->groupBy($sourceKey);

        foreach ($chats as $c) {
            // values() で 0 始まりに振り直し、先着順での順位（rank）を正しく得る
            $queue = ($grouped->get($c->{$sourceKey}) ?? collect())->values();
            $c->queue_total = $queue->count();
            $idx = $queue->search(fn($q) => $q->id === $c->id);
            $c->queue_position = $idx === false ? null : $idx + 1;
        }
    }
}
