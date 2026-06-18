<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * バッチ（Artisanコマンド）の実行履歴。admin が管理画面で稼働状況を確認するために残す。
 * `BatchCommand` を継承したコマンドが実行のたびに1行記録する。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batch_runs', function (Blueprint $table) {
            $table->id();
            // 実行したコマンド名（例: listings:expire）
            $table->string('command', 100)->index();
            // running（実行中）/ success（正常終了）/ failed（例外発生）
            $table->string('status', 20)->default('running');
            // コマンドが返した要約（info 出力）または例外メッセージ
            $table->text('summary')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            // 所要時間（ミリ秒）
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamps();

            // 一覧は新しい順に取得するため複合インデックスを張る
            $table->index(['command', 'started_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batch_runs');
    }
};
