<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TradeHistory extends Model
{
    protected $table = 'trade_history';

    public $timestamps = false;
    const CREATED_AT = null;
    const UPDATED_AT = null;

    protected $fillable = [
        'listing_id', 'buy_request_id', 'item_id', 'seller_id', 'buyer_id', 'seller_ip', 'buyer_ip',
        'price', 'currency', 'server', 'is_valid', 'traded_at',
    ];

    protected function casts(): array
    {
        return [
            'is_valid' => 'boolean',
            'traded_at' => 'datetime',
        ];
    }

    public function item()
    {
        return $this->belongsTo(Item::class);
    }

    public function seller()
    {
        return $this->belongsTo(User::class, 'seller_id');
    }

    public function buyer()
    {
        return $this->belongsTo(User::class, 'buyer_id');
    }
}
