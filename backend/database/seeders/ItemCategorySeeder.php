<?php

namespace Database\Seeders;

use App\Models\ItemCategory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;

class ItemCategorySeeder extends Seeder
{
    public function run(): void
    {
        // 既存データをクリアしてから投入（FK制約を一時的に無効化）
        Schema::disableForeignKeyConstraints();
        ItemCategory::truncate();
        Schema::enableForeignKeyConstraints();

        $data = [
            ['name' => '装備セット', 'children' => []],
            ['name' => 'テクニック', 'children' => ['ノアピース', '秘伝の書']],
            ['name' => '武器', 'children' => ['刀剣', 'こん棒', '槍', '銃器', '投げ', '弓', '素手', '盾']],
            ['name' => '防具', 'children' => ['頭', '胴', '手', 'パ', '靴', '肩', '腰']],
            ['name' => '装飾品', 'children' => ['頭(装)', '顔(装)', '耳(装)', '指(装)', '胸(装)', '背中(装)', '腰(装)']],
            ['name' => 'アセット', 'children' => []],
            ['name' => 'その他', 'children' => ['未開封ペット', 'レシピ']],
        ];

        foreach ($data as $sort => $cat) {
            $parent = ItemCategory::create(['name' => $cat['name'], 'sort_order' => $sort]);
            foreach ($cat['children'] as $childSort => $childName) {
                ItemCategory::create([
                    'parent_id'  => $parent->id,
                    'name'       => $childName,
                    'sort_order' => $childSort,
                ]);
            }
        }
    }
}
