<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserCharacter extends Model
{
    protected $fillable = ['user_id', 'server', 'character_name'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
