<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketPrice extends Model
{
    protected $table = 'market_prices';

    protected $fillable = [
        'item_id', 'price', 'currency', 'server', 'traded_at', 'registered_by', 'note',
    ];

    protected function casts(): array
    {
        return [
            'traded_at' => 'datetime',
        ];
    }

    public function item()
    {
        return $this->belongsTo(Item::class);
    }

    public function registeredBy()
    {
        return $this->belongsTo(User::class, 'registered_by');
    }
}
