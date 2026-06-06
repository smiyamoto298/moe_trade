<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ItemCategory extends Model
{
    public $timestamps = false;
    protected $fillable = ['parent_id', 'name', 'sort_order'];

    public function parent()
    {
        return $this->belongsTo(ItemCategory::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(ItemCategory::class, 'parent_id')->orderBy('sort_order');
    }
}
