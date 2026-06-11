<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            ItemCategorySeeder::class,
            BonusEffectTypeSeeder::class,
            BonusValueLabelSeeder::class,
        ]);
    }
}
