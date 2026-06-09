<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // editor / admin が編集・確認すると true になる。
            // true のアイテムは登録者（一般 user）が上書き編集できない（排他制御）。
            $table->boolean('locked_by_staff')->default(false)->after('verified_at');
        });

        // 既存の確認済みアイテムは staff の手が入っているものとしてロック扱いにする
        \Illuminate\Support\Facades\DB::table('items')
            ->where('verified_status', 'verified')
            ->update(['locked_by_staff' => true]);
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('locked_by_staff');
        });
    }
};
