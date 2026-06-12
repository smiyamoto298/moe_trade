<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * 装備セットの「同一性能の部位まとめ表示」の回帰防止。
 * フロントエンドにテストランナーが無いため、FrontendOgpMetaTest と同様に
 * ソースを静的に検証する（design.md「装備セット」章参照）。
 *
 * - 一覧（ListingsPage）: 追加効果/付加効果列を効果内容でグループ化
 * - 詳細（EquipmentSetBreakdown）: 性能（追加効果・付加効果・特殊条件）が
 *   すべて同一の部位を1カードにまとめて表示
 */
class FrontendEquipmentSetGroupingTest extends TestCase
{
    private function frontendFile(string $relative): string
    {
        // php コンテナには backend のみマウントされるため、frontend が見えない環境ではスキップ
        // （CI はリポジトリ全体をチェックアウトした上で実行するので必ず検証される）
        $path = base_path('../frontend/' . $relative);
        if (! is_file($path)) {
            $this->markTestSkipped("frontend/{$relative} がこの環境からは参照できない");
        }

        return file_get_contents($path);
    }

    public function test_グルーピングヘルパーは性能まとめ用のgroupPiecesByPerformanceを公開する(): void
    {
        $src = $this->frontendFile('src/utils/equipmentSet.ts');

        $this->assertStringContainsString('export const groupPiecesByPerformance', $src);
        // 性能キーは追加効果・付加効果・特殊条件のすべてを含む（どれかが欠けると別性能の部位が誤って結合される）
        $this->assertStringContainsString('baseStatsKey(it)', $src);
        $this->assertStringContainsString('bonusEffectsKey(it)', $src);
        $this->assertStringContainsString('specialConditionsKey(it)', $src);
        // 追加効果キーはミスリル有無も区別する
        $this->assertStringContainsString('mithril: it.mithril', $src);
        // グループは部位名に加えて部位アイテム自体（名前表示用）も保持する
        $this->assertStringContainsString('members: Item[]', $src);
    }

    public function test_詳細のセット内訳は同一性能の部位をまとめて表示する(): void
    {
        $src = $this->frontendFile('src/components/EquipmentSetBreakdown.tsx');

        // 詳細ページの内訳コンポーネントが性能グルーピングを使っている
        $this->assertStringContainsString('groupPiecesByPerformance', $src);
        // グループ内の全部位（チップ＋名前）を列挙して1カードに表示する
        $this->assertStringContainsString('g.members.map', $src);
        // 見出しの部位数はグループ数ではなく実部位数を表示する
        $this->assertStringContainsString('members.length}部位', $src);
    }

    public function test_詳細はセット本体アイテム自体の性能（旧データ）を表示しない(): void
    {
        // 出品/買取詳細とも、装備セットのときは item 自体の追加効果・付加効果・特殊条件
        // セクションを表示しない（部位ごとの性能のみを正とする）
        foreach (['src/pages/ListingDetailPage.tsx', 'src/pages/BuyRequestDetailPage.tsx'] as $page) {
            $src = $this->frontendFile($page);

            $this->assertStringContainsString(
                '!item.is_equipment_set && Object.keys(item.base_stats)', $src, $page);
            $this->assertStringContainsString(
                '!item.is_equipment_set && item.bonus_effects.length', $src, $page);
            $this->assertStringContainsString(
                '!item.is_equipment_set && item.special_conditions.length', $src, $page);
        }
    }

    public function test_一覧の効果列は効果内容ごとのグルーピングを使う(): void
    {
        $src = $this->frontendFile('src/pages/ListingsPage.tsx');

        $this->assertStringContainsString('groupPiecesByBaseStats', $src);
        $this->assertStringContainsString('groupPiecesByBonusEffects', $src);
    }
}
