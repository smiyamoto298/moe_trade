<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TradeMessage extends Model
{
    const UPDATED_AT = null;

    protected $fillable = ['chat_id', 'user_id', 'message'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function chat()
    {
        return $this->belongsTo(TradeChat::class, 'chat_id');
    }
}
