<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

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
}
