<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BonusEffectType extends Model
{
    public $timestamps = false;
    protected $fillable = ['type_key', 'label', 'category'];
}
