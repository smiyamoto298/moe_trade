<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TradeChat extends Model
{
    protected $fillable = ['listing_id', 'buyer_id', 'server', 'status', 'seller_completed', 'buyer_completed'];

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

    public function buyer()
    {
        return $this->belongsTo(User::class, 'buyer_id');
    }

    public function messages()
    {
        return $this->hasMany(TradeMessage::class, 'chat_id')->orderBy('created_at');
    }
}
