<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class BoardPost extends Model
{
    protected $fillable = ['thread_id', 'user_id', 'message', 'image_path'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    /**
     * 添付画像の公開URL。未添付なら null。
     */
    public function imageUrl(): ?string
    {
        return $this->image_path ? Storage::disk('public')->url($this->image_path) : null;
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
