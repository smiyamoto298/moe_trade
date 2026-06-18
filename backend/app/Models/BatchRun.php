<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * バッチ（Artisanコマンド）の1回分の実行履歴。
 * 記録は `App\Console\Commands\BatchCommand` が自動で行う。
 */
class BatchRun extends Model
{
    protected $fillable = [
        'command', 'status', 'summary', 'started_at', 'finished_at', 'duration_ms',
    ];

    protected function casts(): array
    {
        return [
            'started_at'  => 'datetime',
            'finished_at' => 'datetime',
            'duration_ms' => 'integer',
        ];
    }
}
