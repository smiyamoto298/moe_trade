<?php

namespace App\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class Announcement extends Model
{
    protected $fillable = [
        'message', 'level', 'link_url', 'link_label', 'link_new_tab', 'is_active', 'sort_order',
        'display_days', 'expires_at', 'target_type', 'target_user_ids',
    ];

    protected function casts(): array
    {
        return [
            'is_active'       => 'boolean',
            'link_new_tab'    => 'boolean',
            'sort_order'      => 'integer',
            'display_days'    => 'integer',
            'expires_at'      => 'datetime',
            'target_user_ids' => 'array',
        ];
    }

    /**
     * このお知らせを指定ユーザー（未ログインは null）に表示してよいか。
     * - all      : 全員に表示
     * - staff    : 管理・編集者のみ
     * - specific : target_user_ids に含まれるユーザーのみ
     */
    public function isVisibleTo(?User $user): bool
    {
        return match ($this->target_type) {
            'staff'    => $user !== null && $user->isEditor(),
            'specific' => $user !== null && in_array($user->id, $this->target_user_ids ?? [], true),
            default    => true,
        };
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
