<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Listing extends Model
{
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
        return $this->hasMany(ListingServer::class);
    }

    public function chats()
    {
        return $this->hasMany(TradeChat::class);
    }
}
