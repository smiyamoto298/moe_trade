<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Listing extends Model
{
    /**
     * 公開一覧・詳細で見える出品に絞り込む。
     *
     * status が $statuses に含まれること。ただし active は期限切れ（expires_at が過去）を除外する。
     * これにより日次バッチ listings:expire が走る前でも、期限超過した出品が一覧・詳細に出ない。
     * completed は成立済みなので期限に関わらず表示対象に残す。
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
     * 期限切れの出品に絞り込む。
     *
     * status='expired'（バッチ確定済み）、または status='active' のまま expires_at が過去
     * （バッチ未実行で期限超過）を対象にする。フロント MyPage の isExpired と対称。
     */
    public function scopeExpired(Builder $query): Builder
    {
        // オークションは期限到来後にバッチで自動成立/取り下げされる（再出品しない）ため、
        // 「期限切れ＝再出品促し」の対象には含めない。
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
        'trade_type', 'comment', 'is_worn', 'is_dyed', 'status', 'expires_at', 'bumped_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'bumped_at' => 'datetime',
            'price' => 'integer',
            'buyout_price' => 'integer',
            'quantity' => 'integer',
            'is_worn' => 'boolean',
            'is_dyed' => 'boolean',
        ];
    }

    /** オークション出品かどうか。 */
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
        return $this->hasMany(ListingServer::class);
    }

    public function chats()
    {
        return $this->hasMany(TradeChat::class);
    }

    /**
     * 各出品サーバーの連絡先キャラクターを「出品者の現在のキャラクター」で解決する。
     *
     * 表示用の character は listing_servers.character_id（出品時のスナップショット）ではなく、
     * 出品者がそのサーバーに現在登録しているキャラクター（user_characters は user_id+server で一意）
     * から動的に求める。これにより、キャラクター名の変更・削除＆再登録・サーバー変更があっても
     * 一覧・詳細・取引チャットで連絡先名が消えたり古いままになったりしない。
     *
     * N+1 を避けるため、呼び出し側で 'user.characters' と 'servers' を eager load しておくこと。
     */
    public function resolveServerContacts(): static
    {
        if (!$this->relationLoaded('servers')) {
            return $this;
        }
        $owner = $this->user; // eager load 済みならそれを、未ロードなら遅延ロード
        $chars = $owner ? $owner->characters : collect();
        foreach ($this->servers as $server) {
            $server->setRelation('character', $chars->firstWhere('server', $server->server));
        }
        return $this;
    }
}
