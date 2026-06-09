<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // アセット固有パラメータ
            $table->string('placement', 20)->nullable()->after('exclusive_skill');      // 設置個所: 床 / 壁 / 天井
            $table->unsignedSmallInteger('asset_width')->nullable()->after('placement');  // サイズ: 横
            $table->unsignedSmallInteger('asset_height')->nullable()->after('asset_width'); // サイズ: 縦
            $table->unsignedInteger('storage_count')->nullable()->after('asset_height');  // ストレージ数
            $table->string('special_function', 30)->nullable()->after('storage_count');   // 特殊機能（単一）
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn([
                'placement', 'asset_width', 'asset_height', 'storage_count', 'special_function',
            ]);
        });
    }
};
