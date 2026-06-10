<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * サイト上部に表示する「お知らせ」。管理者が内容・表示/非表示を設定する。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->text('message');
            // 表示色: info(青) / warning(黄) / error(赤)
            $table->string('level', 20)->default('warning');
            $table->string('link_url', 500)->nullable();
            $table->string('link_label', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // 既存の固定文言を初期データとして登録（挙動を維持）
        DB::table('announcements')->insert([
            'message'    => '現在テスト運用中です！大規模な修正が必要になった場合データがリセットされる場合があります！最新情報はXでご確認ください！',
            'level'      => 'warning',
            'link_url'   => 'https://x.com/senir_moe',
            'link_label' => '@senir_moe',
            'is_active'  => true,
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('announcements');
    }
};
