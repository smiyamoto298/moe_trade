<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // レシピの「バインダー」候補。付加効果の項目名（bonus_value_labels）と同じ仕組みで管理する。
        Schema::create('binder_labels', function (Blueprint $table) {
            $table->id();
            $table->string('label', 100)->unique();
            $table->integer('sort_order')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('binder_labels');
    }
};
