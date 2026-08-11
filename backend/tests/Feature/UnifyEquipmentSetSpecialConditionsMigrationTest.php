<?php

namespace Tests\Feature;

use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * 装備セットの特殊条件を「全部位共通」へ統一するデータ移行
 * （2026_08_12_000001_unify_equipment_set_special_conditions）の検証。
 * design.md「装備セット」: 特殊条件は独立した設定グループで管理し、
 * 移行前の既存データは構成部位（テクニック除く）の和集合を全部位へ適用する。
 */
class UnifyEquipmentSetSpecialConditionsMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function runMigration(): void
    {
        $migration = require database_path(
            'migrations/2026_08_12_000001_unify_equipment_set_special_conditions.php'
        );
        $migration->up();
    }

    /** 装備セット本体と構成部位を作成して [set, pieces...] を返す */
    private function makeSet(array $pieceDefs): array
    {
        $cats = $this->makeCategoryTree();

        $set = Item::create([
            'category_id'      => $cats['weapon']->id,
            'name'             => 'テストセット' . uniqid(),
            'is_equipment_set' => true,
            'verified_status'  => 'verified',
        ]);

        $pieces = [];
        foreach ($pieceDefs as $i => $def) {
            $piece = Item::create([
                'category_id'        => ($def['technique'] ?? false) ? $cats['noah']->id : $cats['sword']->id,
                'name'               => "テスト部位{$i}_" . uniqid(),
                'special_conditions' => $def['conditions'],
                'verified_status'    => 'verified',
            ]);
            DB::table('equipment_set_members')->insert([
                'set_item_id'   => $set->id,
                'piece_item_id' => $piece->id,
                'sort_order'    => $i,
            ]);
            $pieces[] = $piece;
        }

        return [$set, $pieces];
    }

    public function test_一部の部位にしかない特殊条件を全部位へ適用する(): void
    {
        [, $pieces] = $this->makeSet([
            ['conditions' => ['NT']],
            ['conditions' => []],
        ]);

        $this->runMigration();

        $this->assertSame(['NT'], $pieces[0]->fresh()->special_conditions);
        $this->assertSame(['NT'], $pieces[1]->fresh()->special_conditions);
    }

    public function test_部位ごとに異なる特殊条件は部位順を保った和集合に統一する(): void
    {
        [, $pieces] = $this->makeSet([
            ['conditions' => ['ND', 'NT']],
            ['conditions' => ['PM']],
            ['conditions' => ['NT']],
        ]);

        $this->runMigration();

        foreach ($pieces as $piece) {
            $this->assertSame(['ND', 'NT', 'PM'], $piece->fresh()->special_conditions);
        }
    }

    public function test_テクニック部位には適用せず和集合の対象にも含めない(): void
    {
        [, $pieces] = $this->makeSet([
            ['conditions' => ['NT']],
            ['conditions' => [], 'technique' => true],
        ]);

        $this->runMigration();

        $this->assertSame(['NT'], $pieces[0]->fresh()->special_conditions);
        // テクニック部位は特殊条件を持たないまま
        $this->assertSame([], $pieces[1]->fresh()->special_conditions ?? []);
    }

    public function test_特殊条件のないセットとセット外のアイテムは変更しない(): void
    {
        [, $pieces] = $this->makeSet([
            ['conditions' => []],
            ['conditions' => []],
        ]);
        // 装備セットに属さない単体アイテム（条件つき）
        $standalone = $this->makeItem(['name' => '単体アイテム', 'special_conditions' => ['OP']]);
        $updatedAt = $pieces[0]->fresh()->updated_at;

        $this->runMigration();

        $this->assertSame([], $pieces[0]->fresh()->special_conditions ?? []);
        $this->assertSame([], $pieces[1]->fresh()->special_conditions ?? []);
        $this->assertSame(['OP'], $standalone->fresh()->special_conditions);
        // 変更のない部位は updated_at も変わらない
        $this->assertTrue($updatedAt->equalTo($pieces[0]->fresh()->updated_at));
    }
}
