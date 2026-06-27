<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * 買取（買いたい）。
 * 構造は Listing と対称だが、user は「買い手」を表す。
 */
class BuyRequest extends Model
{
    /**
     * 公開一覧・詳細で見える買取に絞り込む。
     *
     * status が $statuses に含まれること。ただし active は期限切れ（expires_at が過去）を除外する。
     * これにより日次バッチ listings:expire が走る前でも、期限超過した買取が一覧・詳細に出ない。
     * completed は成立済みなので期限に関わらず表示対象に残す。Listing::scopeVisible と対称。
     */
    public function scopeVisible(Builder $query, array $statuses): Builder
    {
        return $query->whereIn('status', $statuses)
            ->where(function (Builder $q) {
                $q->where('status', '!=', 'active')
                  ->orWhereNull('expires_at')
                  ->orWhere('expires_at', '>=', now());
            });
    }

    /**
     * 期限切れの買取に絞り込む。Listing::scopeExpired と対称。
     */
    public function scopeExpired(Builder $query): Builder
    {
        // オークションは期限到来後にバッチで自動成立/取り下げされる（再登録しない）ため、
        // 「期限切れ＝再登録促し」の対象には含めない。
        return $query->where('trade_type', '!=', 'auction')
            ->where(function (Builder $q) {
                $q->where('status', 'expired')
                  ->orWhere(function (Builder $q2) {
                      $q2->where('status', 'active')
                         ->whereNotNull('expires_at')
                         ->where('expires_at', '<', now());
                  });
            });
    }

    protected $fillable = [
        'user_id', 'item_id', 'price', 'buyout_price', 'currency', 'quantity',
        'trade_type', 'comment', 'status', 'expires_at', 'bumped_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'bumped_at' => 'datetime',
            'price' => 'integer',
            'buyout_price' => 'integer',
            'quantity' => 'integer',
        ];
    }

    /** オークション買取かどうか。 */
    public function isAuction(): bool
    {
        return $this->trade_type === 'auction';
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function item()
    {
        return $this->belongsTo(Item::class);
    }

    public function servers()
    {
        return $this->hasMany(BuyRequestServer::class);
    }

    public function chats()
    {
        return $this->hasMany(TradeChat::class, 'buy_request_id');
    }

    /**
     * 各買取サーバーの連絡先キャラクターを「登録者の現在のキャラクター」で解決する。
     * Listing::resolveServerContacts と同じ考え方。
     */
    public function resolveServerContacts(): static
    {
        if (!$this->relationLoaded('servers')) {
            return $this;
        }
        $owner = $this->user;
        $chars = $owner ? $owner->characters : collect();
        foreach ($this->servers as $server) {
            $server->setRelation('character', $chars->firstWhere('server', $server->server));
        }
        return $this;
    }
}
