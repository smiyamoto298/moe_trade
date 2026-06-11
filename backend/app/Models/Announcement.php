<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Announcement extends Model
{
    protected $fillable = [
        'message', 'level', 'link_url', 'link_label', 'is_active', 'sort_order',
        'display_days', 'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'is_active'    => 'boolean',
            'sort_order'   => 'integer',
            'display_days' => 'integer',
            'expires_at'   => 'datetime',
        ];
    }

    /**
     * display_days を基準に expires_at を再計算してモデルにセットする。
     * 基準は created_at（未保存なら now）。display_days が空または0以下なら無期限（null）。
     */
    public function syncExpiresAt(): void
    {
        $days = $this->display_days;
        if ($days === null || $days <= 0) {
            $this->display_days = null;
            $this->expires_at   = null;
            return;
        }
        $base = $this->created_at ?? now();
        $this->expires_at = $base->copy()->addDays($days);
    }
}
