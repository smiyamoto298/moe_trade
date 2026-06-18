<?php

namespace App\Console\Commands;

use App\Models\BatchRun;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * 実行履歴を batch_runs に自動記録するバッチコマンドの基底クラス。
 *
 * 継承先は handle() ではなく runBatch() を実装し、実行結果の要約文字列を返す。
 * 開始時に running の行を作り、正常終了で success・例外で failed に更新する。
 * cron 直叩き（deploy/cron-*.sh）でも schedule:run 経由でも同じように記録される。
 */
abstract class BatchCommand extends Command
{
    /**
     * バッチ本体。管理画面に出す要約（例: "期限切れ出品を 3 件取り下げました。"）を返す。
     */
    abstract protected function runBatch(): string;

    public function handle(): int
    {
        $startedAt = Carbon::now();
        $run = BatchRun::create([
            'command'    => $this->getName(),
            'status'     => 'running',
            'started_at' => $startedAt,
        ]);

        try {
            $summary = $this->runBatch();
            $run->update([
                'status'      => 'success',
                'summary'     => $summary,
                'finished_at' => $finishedAt = Carbon::now(),
                'duration_ms' => $startedAt->diffInMilliseconds($finishedAt),
            ]);
            $this->info($summary);
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $run->update([
                'status'      => 'failed',
                'summary'     => $e->getMessage(),
                'finished_at' => $finishedAt = Carbon::now(),
                'duration_ms' => $startedAt->diffInMilliseconds($finishedAt),
            ]);
            // ログ・通知（Sentry 等）にも流す。バッチは非0で終了させる。
            report($e);
            $this->error($e->getMessage());
            return self::FAILURE;
        }
    }
}
