<?php

namespace App\Console\Commands;

use App\Support\ProdDataMasker;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 本番DBを読み取り、本番固有情報（IP・キャラ名・ログイン情報）をマスキングして
 * ローカルDBへ複製する開発用バッチ。**ローカル環境専用**。
 *
 * - 本番への接続は `prod` 接続（PROD_DB_* / config/database.php）を読み取り専用で使う。
 * - ローカルの対象テーブルは truncate してから本番データで置き換える（破壊的）。
 * - マスキングは {@see ProdDataMasker} に集約。マスキング後も判別可能な形にする。
 * - 実行履歴は BatchCommand により batch_runs に記録され、管理画面で確認できる。
 */
class PullProdData extends BatchCommand
{
    protected $signature   = 'db:pull-prod {--chunk=500 : 一括INSERTの行数}';
    protected $description = '本番DBをマスキングしてローカルDBへ複製する（ローカル専用）';

    /**
     * 複製しないテーブル（一時データ・トークン・ローカル固有の実行履歴）。
     * これらは本番から持ち込まず、ローカルの状態を維持する。
     */
    private const SKIP_TABLES = [
        'migrations',
        'sessions',
        'password_reset_tokens',
        'personal_access_tokens',
        'cache',
        'cache_locks',
        'jobs',
        'job_batches',
        'failed_jobs',
        'batch_runs',
    ];

    protected function runBatch(): string
    {
        // 安全装置: 本番環境では絶対に実行しない（ローカルDBを破壊的に上書きするため）。
        if (app()->environment('production')) {
            throw new \RuntimeException('このコマンドは本番環境では実行できません。');
        }
        if (empty(config('database.connections.prod.host'))) {
            throw new \RuntimeException('本番DB接続(PROD_DB_*)が設定されていません。.env を確認してください。');
        }

        $masker = new ProdDataMasker();
        $local  = DB::connection();         // 既定（ローカル）
        $prod   = DB::connection('prod');   // 本番（読み取り）
        $chunk  = max(1, (int) $this->option('chunk'));

        $prodTables  = $this->tableNames('prod');
        $localTables = $this->tableNames($local->getName());

        $copied  = [];

        $local->statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach ($prodTables as $table) {
                // スキップ対象、またはローカルに存在しないテーブルは飛ばす。
                if (in_array($table, self::SKIP_TABLES, true)) {
                    continue;
                }
                if (!in_array($table, $localTables, true)) {
                    continue;
                }

                // ローカルに実在する列だけ書き込む（スキーマ差異に強くする）。
                $columns = array_flip(Schema::getColumnListing($table));
                $local->table($table)->truncate();

                $buffer = [];
                $count  = 0;
                foreach ($prod->table($table)->cursor() as $row) {
                    $row = $masker->maskRow($table, (array) $row);
                    $buffer[] = array_intersect_key($row, $columns);
                    if (count($buffer) >= $chunk) {
                        $local->table($table)->insert($buffer);
                        $count += count($buffer);
                        $buffer = [];
                    }
                }
                if ($buffer) {
                    $local->table($table)->insert($buffer);
                    $count += count($buffer);
                }
                $copied[$table] = $count;
            }
        } finally {
            $local->statement('SET FOREIGN_KEY_CHECKS=1');
        }

        return $this->summarize($masker, $copied);
    }

    /** 接続名から実テーブル名の一覧を取得する。 */
    private function tableNames(string $connection): array
    {
        return collect(Schema::connection($connection)->getTables())
            ->pluck('name')
            ->all();
    }

    /** 実行結果の要約（件数 + ローカルログイン情報）を組み立てる。 */
    private function summarize(ProdDataMasker $masker, array $copied): string
    {
        $totalRows   = array_sum($copied);
        $totalTables = count($copied);
        $lines = ["{$totalTables} テーブル / 計 {$totalRows} 行を本番から複製しました（IP・キャラ名・ログイン情報をマスキング済み）。"];

        // 管理者・編集者のローカルログイン情報を案内（共通パスワードで全員ログイン可）。
        $staff = DB::table('users')->whereIn('role', ['admin', 'editor'])->orderBy('id')->get(['id', 'role']);
        if ($staff->isNotEmpty()) {
            $lines[] = 'ログイン: パスワードは「' . ProdDataMasker::DEV_PASSWORD . '」（全ユーザー共通）。管理権限アカウント:';
            foreach ($staff as $u) {
                $lines[] = "  [{$u->role}] {$masker->devEmail((int) $u->id)}";
            }
        }

        return implode("\n", $lines);
    }
}
