<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Listing extends Model
{
    protected $fillable = [
        'user_id', 'item_id', 'price', 'currency', 'quantity',
        'trade_type', 'comment', 'is_worn', 'is_dyed', 'status', 'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'price' => 'integer',
            'quantity' => 'integer',
            'is_worn' => 'boolean',
            'is_dyed' => 'boolean',
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
