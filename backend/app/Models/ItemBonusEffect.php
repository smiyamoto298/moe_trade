<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ItemBonusEffect extends Model
{
    public $timestamps = false;
    protected $fillable = ['item_id', 'effect_name', 'values', 'description', 'is_exclusive'];

    protected function casts(): array
    {
        return ['values' => 'array', 'is_exclusive' => 'boolean'];
    }

    public function item()
    {
        return $this->belongsTo(Item::class);
    }
}
