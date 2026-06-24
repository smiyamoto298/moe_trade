<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 「サーバ登録対象外」のシステム共通アイテム名。
 *
 * ここに登録された名前のアイテムは、保存先がサーバー（DB）でも台帳をサーバーへ保存せず、
 * クライアントのローカルストレージにだけ保存する（運営に見られたくないアイテム向け）。
 * 種別（exclusion_types）と同様に、システム共通分は管理者がここで管理し、ユーザー個別分は
 * クライアントのローカルストレージにのみ保持する（サーバーには送らない＝所持を推測させない）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_excluded_items', function (Blueprint $table) {
            $table->id();
            $table->string('name', 200)->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_excluded_items');
    }
};
