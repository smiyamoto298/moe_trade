<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BoardPost extends Model
{
    protected $fillable = ['thread_id', 'user_id', 'message'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function thread()
    {
        return $this->belongsTo(BoardThread::class, 'thread_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
