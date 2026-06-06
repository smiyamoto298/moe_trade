<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    protected $fillable = [
        'category_id', 'name', 'description', 'image_url',
        'base_stats', 'special_conditions', 'dyeable', 'mithril',
        'is_equipment_set', 'set_piece_category_ids',
        'skill_requirements',
        'verified_status', 'submitted_by', 'verified_by', 'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'base_stats' => 'array',
            'special_conditions' => 'array',
            'dyeable' => 'boolean',
            'mithril' => 'boolean',
            'is_equipment_set' => 'boolean',
            'set_piece_category_ids' => 'array',
            'skill_requirements' => 'array',
            'verified_at' => 'datetime',
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

    public function submittedBy()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function verifiedBy()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
