<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 取引チャットに「取引希望を送信したときのIP」を記録する列を追加する。
 * 相場の同一人物判定は、取引希望送信時のIPと取引成立送信時のIPで行う。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->string('request_ip', 45)->nullable()->after('server');
        });
    }

    public function down(): void
    {
        Schema::table('trade_chats', function (Blueprint $table) {
            $table->dropColumn('request_ip');
        });
    }
};
