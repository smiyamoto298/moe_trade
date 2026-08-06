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
 * - 対象テーブルは**スキーマごと**本番から複製する（ローカル側を drop → 本番の CREATE 文で再作成 → データ投入）。
 *   `migrations` テーブルも本番の適用状態ごと複製し、取込後に `migrate` を実行することで、
 *   本番に未デプロイのマイグレーション（データ変換・バックフィル含む）が取込データへ適用しなおされる。
 * - 本番に存在しないローカルのテーブルは drop する（未デプロイ分のマイグレーションが再作成する）。
 * - マスキングは {@see ProdDataMasker} に集約。マスキング後も判別可能な形にする。
 * - 実行履歴は BatchCommand により batch_runs に記録され、管理画面で確認できる。
 */
class PullProdData extends BatchCommand
{
    protected $signature   = 'db:pull-prod {--chunk=500 : 一括INSERTの行数}';
    protected $description = '本番DBをスキーマごとマスキング複製し、未デプロイのマイグレーションを適用しなおす（ローカル専用）';

    /**
     * 本番から複製せず、ローカルのスキーマ・データをそのまま維持するテーブル
     * （一時データ・トークン・ローカル固有の実行履歴）。ログイン中のセッションも保持される。
     */
    private const KEEP_LOCAL_TABLES = [
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
        if (empty(config('database.connections.prod.host')) && empty(config('database.connections.prod.database'))) {
            throw new \RuntimeException('本番DB接続(PROD_DB_*)が設定されていません。.env を確認してください。');
        }

        $local = DB::connection();         // 既定（ローカル）
        $prod  = DB::connection('prod');   // 本番（読み取り）

        // スキーマ複製は CREATE 文をそのまま流用するため、同一ドライバ間でのみ動作する。
        if ($local->getDriverName() !== $prod->getDriverName()) {
            throw new \RuntimeException(
                "ローカル({$local->getDriverName()})と本番({$prod->getDriverName()})のDBドライバが異なるため複製できません。"
            );
        }

        $masker = new ProdDataMasker();
        $chunk  = max(1, (int) $this->option('chunk'));

        $prodTables  = $this->tableNames('prod');
        $localTables = $this->tableNames($local->getName());

        $copied = [];

        $this->setForeignKeyChecks($local, false);
        try {
            // 1) 置き換え対象（KEEP 以外の全ローカルテーブル）を先にまとめて drop する。
            //    本番に無いテーブルもここで消える（未デプロイ分のマイグレーションが後段で再作成する）。
            //    SQLite はトランザクション内だと PRAGMA での FK 無効化が効かないため、
            //    子→親の順（誰からも参照されていないテーブルから）で drop して整合を保つ。
            $this->dropTablesChildFirst($local, array_values(array_diff($localTables, self::KEEP_LOCAL_TABLES)));

            // 2) 本番の各テーブルをスキーマごと複製する（migrations テーブルも適用状態ごと持ち込む）。
            foreach ($prodTables as $table) {
                if (in_array($table, self::KEEP_LOCAL_TABLES, true)) {
                    continue;
                }

                $this->replicateSchema($prod, $local, $table);

                $buffer = [];
                $count  = 0;
                foreach ($prod->table($table)->cursor() as $row) {
                    $buffer[] = $masker->maskRow($table, (array) $row);
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
            $this->setForeignKeyChecks($local, true);
        }

        // 3) 本番に未デプロイのマイグレーションを取込データへ適用しなおす。
        $migrated = $this->applyPendingMigrations($local);

        return $this->summarize($masker, $copied, $migrated);
    }

    /**
     * テーブル群を「誰からも参照されていないもの（子）から」順に drop する。
     *
     * SQLite で FK 有効のままテーブルを drop すると、参照している側のテーブルの
     * FK 定義が再解析され、参照先が既に消えていると "no such table" で失敗する。
     * 子→親の順なら drop 時点で参照元が存在しないため安全に消せる。
     * （MySQL 側は FOREIGN_KEY_CHECKS=0 で順序不問だが、同じ経路で問題ない）
     */
    private function dropTablesChildFirst($local, array $tables): void
    {
        // 各テーブルが参照している親テーブル一覧（自己参照は除く）。
        $parents = [];
        foreach ($tables as $table) {
            $parents[$table] = collect(Schema::getForeignKeys($table))
                ->pluck('foreign_table')
                ->filter(fn ($t) => $t !== $table)
                ->unique()
                ->all();
        }

        $remaining = $tables;
        while ($remaining !== []) {
            // 残りのテーブルから参照されていないもの＝子側から消せる。
            $referenced = [];
            foreach ($remaining as $table) {
                foreach ($parents[$table] as $parent) {
                    $referenced[$parent] = true;
                }
            }
            $droppable = array_values(array_filter($remaining, fn ($t) => !isset($referenced[$t])));
            if ($droppable === []) {
                // 循環参照時は順序保証できないためそのまま消す（FK チェック無効時は問題にならない）。
                $droppable = $remaining;
            }
            foreach ($droppable as $table) {
                Schema::dropIfExists($table);
            }
            $remaining = array_values(array_diff($remaining, $droppable));
        }
    }

    /** 本番のテーブルを CREATE 文ごとローカルへ複製する（データは含まない）。 */
    private function replicateSchema($prod, $local, string $table): void
    {
        Schema::dropIfExists($table);

        if ($prod->getDriverName() === 'sqlite') {
            // テスト用（SQLite）: sqlite_master から CREATE 文を取得する。
            $ddl = $prod->selectOne(
                "select sql from sqlite_master where type = 'table' and name = ?",
                [$table]
            );
            if ($ddl === null || $ddl->sql === null) {
                throw new \RuntimeException("本番テーブル {$table} の CREATE 文を取得できませんでした。");
            }
            $local->statement($ddl->sql);
            // インデックスも複製する（自動生成の内部インデックスは sql が null なので除外される）。
            foreach ($prod->select("select sql from sqlite_master where type = 'index' and tbl_name = ? and sql is not null", [$table]) as $index) {
                $local->statement($index->sql);
            }

            return;
        }

        // MySQL: SHOW CREATE TABLE の結果をそのまま実行する（インデックス・FK・照合順序も複製される）。
        $safe = str_replace('`', '', $table);
        $ddl  = $prod->selectOne("SHOW CREATE TABLE `{$safe}`");
        $sql  = ((array) $ddl)['Create Table'] ?? null;
        if ($sql === null) {
            throw new \RuntimeException("本番テーブル {$table} の CREATE 文を取得できませんでした。");
        }
        $local->statement($sql);
    }

    /** 外部キー制約チェックの一時無効化（ドライバごとに構文が異なる）。 */
    private function setForeignKeyChecks($connection, bool $enabled): void
    {
        if ($connection->getDriverName() === 'sqlite') {
            $connection->statement('PRAGMA foreign_keys = ' . ($enabled ? 'ON' : 'OFF'));
        } else {
            $connection->statement('SET FOREIGN_KEY_CHECKS=' . ($enabled ? '1' : '0'));
        }
    }

    /**
     * 取込後のマイグレーション適用。本番の migrations 状態を持ち込んでいるため、
     * 本番に未デプロイのマイグレーションだけが pending となり、ここで適用しなおされる。
     *
     * @return string[] 適用したマイグレーション名
     */
    private function applyPendingMigrations($local): array
    {
        $before = $local->table('migrations')->pluck('migration')->all();
        $this->callSilent('migrate', ['--force' => true]);
        $after = $local->table('migrations')->pluck('migration')->all();

        return array_values(array_diff($after, $before));
    }

    /** 実行結果の要約（件数 + 再適用したマイグレーション + ローカルログイン情報）を組み立てる。 */
    private function summarize(ProdDataMasker $masker, array $copied, array $migrated): string
    {
        $totalRows   = array_sum($copied);
        $totalTables = count($copied);
        $lines = ["{$totalTables} テーブル / 計 {$totalRows} 行を本番からスキーマごと複製しました（IP・キャラ名・ログイン情報をマスキング済み）。"];

        if ($migrated !== []) {
            $lines[] = 'マイグレーションを ' . count($migrated) . ' 件適用しなおしました（本番に未デプロイ分）:';
            foreach ($migrated as $name) {
                $lines[] = "  {$name}";
            }
        } else {
            $lines[] = '適用しなおすマイグレーションはありませんでした（ローカルは本番と同じ適用状態）。';
        }

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

    /** 接続名から実テーブル名の一覧を取得する（SQLite の内部テーブルは除外）。 */
    private function tableNames(string $connection): array
    {
        return collect(Schema::connection($connection)->getTables())
            ->pluck('name')
            ->reject(fn (string $name) => str_starts_with($name, 'sqlite_'))
            ->values()
            ->all();
    }
}
