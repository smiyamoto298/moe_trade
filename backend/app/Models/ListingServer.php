<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ListingServer extends Model
{
    public $timestamps = false;
    protected $fillable = ['listing_id', 'server', 'character_id'];

    public function listing()
    {
        return $this->belongsTo(Listing::class);
    }

    public function character()
    {
        return $this->belongsTo(UserCharacter::class, 'character_id');
    }
}
