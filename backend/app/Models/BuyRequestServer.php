<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BuyRequestServer extends Model
{
    public $timestamps = false;
    protected $fillable = ['buy_request_id', 'server', 'character_id'];

    public function buyRequest()
    {
        return $this->belongsTo(BuyRequest::class);
    }

    public function character()
    {
        return $this->belongsTo(UserCharacter::class, 'character_id');
    }
}
