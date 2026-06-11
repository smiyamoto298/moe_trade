<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    protected $fillable = [
        'category_id', 'name', 'description', 'image_url',
        'base_stats', 'special_conditions', 'dyeable', 'mithril', 'exclusive_skill',
        'is_equipment_set', 'set_piece_category_ids',
        'skill_requirements',
        'placement', 'asset_width', 'asset_height', 'storage_count', 'special_function',
        'verified_status', 'submitted_by', 'verified_by', 'verified_at',
        'locked_by_staff',
    ];

    protected function casts(): array
    {
        return [
            'base_stats' => 'array',
            'special_conditions' => 'array',
            'dyeable' => 'boolean',
            'mithril' => 'boolean',
            'exclusive_skill' => 'boolean',
            'is_equipment_set' => 'boolean',
            'set_piece_category_ids' => 'array',
            'skill_requirements' => 'array',
            'asset_width' => 'integer',
            'asset_height' => 'integer',
            'storage_count' => 'integer',
            'verified_at' => 'datetime',
            'locked_by_staff' => 'boolean',
        ];
    }

    public function category()
    {
        return $this->belongsTo(ItemCategory::class);
    }

    public function bonusEffects()
    {
        return $this->hasMany(ItemBonusEffect::class);
    }

    /**
     * 装備セットの構成部位（通常アイテム）。多対多。
     * 部位アイテムは独立した通常アイテムなので、セット削除時はピボット行のみ削除される。
     */
    public function setMembers()
    {
        return $this->belongsToMany(
            Item::class,
            'equipment_set_members',
            'set_item_id',
            'piece_item_id'
        )->withPivot('sort_order')->orderBy('equipment_set_members.sort_order');
    }

    public function submittedBy()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function verifiedBy()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
