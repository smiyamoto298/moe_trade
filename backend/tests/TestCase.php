<?php

namespace Tests;

use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\Listing;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * メール認証済みの一般ユーザーを作成する。
     */
    protected function makeUser(array $attributes = []): User
    {
        return User::factory()->create($attributes);
    }

    /**
     * 役割付きユーザー（editor / admin）を作成する。
     */
    protected function makeUserWithRole(string $role): User
    {
        return User::factory()->create(['role' => $role]);
    }

    /**
     * カテゴリツリー（武器>刀剣 / テクニック>ノアピース）を作成して返す。
     */
    protected function makeCategoryTree(): array
    {
        $weapon = ItemCategory::create(['name' => '武器', 'sort_order' => 1]);
        $sword  = ItemCategory::create(['name' => '刀剣', 'parent_id' => $weapon->id, 'sort_order' => 1]);
        $skill  = ItemCategory::create(['name' => 'テクニック', 'parent_id' => null, 'sort_order' => 2]);
        $noah   = ItemCategory::create(['name' => 'ノアピース', 'parent_id' => $skill->id, 'sort_order' => 1]);

        return compact('weapon', 'sword', 'skill', 'noah');
    }

    /**
     * アイテムを作成する（カテゴリ未指定なら 武器>刀剣 を生成して紐付け）。
     */
    protected function makeItem(array $attributes = []): Item
    {
        if (!isset($attributes['category_id'])) {
            $cats = $this->makeCategoryTree();
            $attributes['category_id'] = $cats['sword']->id;
        }

        return Item::create(array_merge([
            'name'            => 'テストの剣',
            'verified_status' => 'verified',
        ], $attributes));
    }

    /**
     * 出品を作成する（出品者・アイテム未指定なら生成）。
     */
    protected function makeListing(?User $seller = null, ?Item $item = null, array $attributes = []): Listing
    {
        $seller ??= $this->makeUser();
        $item   ??= $this->makeItem();

        $listing = Listing::create(array_merge([
            'user_id'    => $seller->id,
            'item_id'    => $item->id,
            'price'      => 1000,
            'currency'   => 'AC',
            'quantity'   => 1,
            'trade_type' => 'fixed',
            'expires_at' => now()->addDays(7),
        ], $attributes));

        $listing->servers()->create(['server' => 'Emerald']);

        return $listing;
    }
}
