<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 項目名候補の種別を追加する。
        //   bonus … 付加効果の項目名（既存データはすべてこちら）
        //   stat  … 追加効果「その他」の項目名
        // 同名でも種別が違えば別候補として扱うため、unique を (kind, label) に張り替える。
        Schema::table('bonus_value_labels', function (Blueprint $table) {
            $table->string('kind', 20)->default('bonus');
        });
        Schema::table('bonus_value_labels', function (Blueprint $table) {
            $table->dropUnique(['label']);
            $table->unique(['kind', 'label']);
        });
    }

    public function down(): void
    {
        Schema::table('bonus_value_labels', function (Blueprint $table) {
            $table->dropUnique(['kind', 'label']);
            $table->unique(['label']);
        });
        Schema::table('bonus_value_labels', function (Blueprint $table) {
            $table->dropColumn('kind');
        });
    }
};
