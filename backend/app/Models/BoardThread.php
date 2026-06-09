<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BoardThread extends Model
{
    protected $fillable = ['user_id', 'title', 'status', 'admin_only'];

    protected $casts = [
        'admin_only' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function posts()
    {
        return $this->hasMany(BoardPost::class, 'thread_id')->orderBy('created_at');
    }
}
