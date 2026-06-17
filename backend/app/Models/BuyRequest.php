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

    protected $fillable = [
        'user_id', 'item_id', 'price', 'currency', 'quantity',
        'trade_type', 'comment', 'status', 'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'price' => 'integer',
            'quantity' => 'integer',
        ];
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
