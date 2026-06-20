<?php

namespace Tests\Feature;

use App\Models\Announcement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnnouncementApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_adminはlink_new_tabを指定してお知らせを作成できる(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/announcements', [
            'message'      => 'お知らせ',
            'link_url'     => 'https://example.com/info',
            'link_label'   => '詳細',
            'link_new_tab' => false,
        ])->assertCreated()
            ->assertJsonPath('link_new_tab', false);

        $this->assertDatabaseHas('announcements', [
            'message'      => 'お知らせ',
            'link_new_tab' => false,
        ]);
    }

    public function test_link_new_tab未指定なら同じウィンドウ_selfがデフォルトになる(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/announcements', [
            'message' => 'デフォルト挙動',
        ])->assertCreated()
            ->assertJsonPath('link_new_tab', false);
    }

    public function test_adminはlink_new_tabを更新できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $a = Announcement::create(['message' => '元', 'link_new_tab' => true]);

        $this->actingAs($admin, 'sanctum')->putJson("/api/admin/announcements/{$a->id}", [
            'message'      => '元',
            'link_new_tab' => false,
        ])->assertOk()
            ->assertJsonPath('link_new_tab', false);

        $this->assertDatabaseHas('announcements', ['id' => $a->id, 'link_new_tab' => false]);
    }

    public function test_target_type未指定ならallがデフォルトになる(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/announcements', [
            'message' => '全員向け',
        ])->assertCreated()
            ->assertJsonPath('target_type', 'all')
            ->assertJsonPath('target_user_ids', null);
    }

    public function test_specificは対象ユーザーIDを保存しall_staffではnullに正規化される(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $target = $this->makeUserWithRole('user');

        // specific: 対象ユーザーIDを保存する
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/announcements', [
            'message'         => '指定ユーザー向け',
            'target_type'     => 'specific',
            'target_user_ids' => [$target->id, $target->id], // 重複は除去される
        ])->assertCreated()
            ->assertJsonPath('target_type', 'specific')
            ->assertJsonPath('target_user_ids', [$target->id]);

        // staff: target_user_ids を渡しても null に正規化される
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/announcements', [
            'message'         => 'スタッフ向け',
            'target_type'     => 'staff',
            'target_user_ids' => [$target->id],
        ])->assertCreated()
            ->assertJsonPath('target_type', 'staff')
            ->assertJsonPath('target_user_ids', null);
    }

    public function test_存在しないユーザーIDはバリデーションで弾かれる(): void
    {
        $admin = $this->makeUserWithRole('admin');

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/announcements', [
            'message'         => '指定ユーザー向け',
            'target_type'     => 'specific',
            'target_user_ids' => [999999],
        ])->assertStatus(422);
    }

    public function test_specificは対象ユーザーにのみ公開一覧で表示される(): void
    {
        // マイグレーションが投入する初期お知らせ（target_type=all）を除いた状態で検証する。
        Announcement::query()->delete();
        $target = $this->makeUserWithRole('user');
        $other  = $this->makeUserWithRole('user');
        Announcement::create(['message' => '指定向け', 'target_type' => 'specific', 'target_user_ids' => [$target->id]]);

        // 対象ユーザー → 見える
        $this->actingAs($target, 'sanctum')->getJson('/api/announcements')
            ->assertOk()->assertJsonCount(1);

        // 対象外ユーザー → 見えない
        $this->actingAs($other, 'sanctum')->getJson('/api/announcements')
            ->assertOk()->assertJsonCount(0);

        // 未ログイン → 見えない
        $this->getJson('/api/announcements')->assertOk()->assertJsonCount(0);
    }

    public function test_staffは管理編集者にのみ公開一覧で表示される(): void
    {
        Announcement::query()->delete();
        $admin  = $this->makeUserWithRole('admin');
        $editor = $this->makeUserWithRole('editor');
        $user   = $this->makeUserWithRole('user');
        Announcement::create(['message' => 'スタッフ向け', 'target_type' => 'staff']);

        $this->actingAs($admin, 'sanctum')->getJson('/api/announcements')->assertOk()->assertJsonCount(1);
        $this->actingAs($editor, 'sanctum')->getJson('/api/announcements')->assertOk()->assertJsonCount(1);
        $this->actingAs($user, 'sanctum')->getJson('/api/announcements')->assertOk()->assertJsonCount(0);
        $this->getJson('/api/announcements')->assertOk()->assertJsonCount(0);
    }

    public function test_allは未ログイン含む全員に表示される(): void
    {
        Announcement::query()->delete();
        $user = $this->makeUserWithRole('user');
        Announcement::create(['message' => '全員向け', 'target_type' => 'all']);

        $this->getJson('/api/announcements')->assertOk()->assertJsonCount(1);
        $this->actingAs($user, 'sanctum')->getJson('/api/announcements')->assertOk()->assertJsonCount(1);
    }

    public function test_対象ユーザーが既読にすると本人が対象から外れる(): void
    {
        $a    = $this->makeUserWithRole('user');
        $b    = $this->makeUserWithRole('user');
        $ann  = Announcement::create([
            'message'         => '指定向け',
            'target_type'     => 'specific',
            'target_user_ids' => [$a->id, $b->id],
        ]);

        // a が既読 → a だけ対象から外れ、b は残るのでお知らせは存続する
        $this->actingAs($a, 'sanctum')->postJson("/api/announcements/{$ann->id}/read")
            ->assertNoContent();

        $ann->refresh();
        $this->assertSame([$b->id], $ann->target_user_ids);

        // a にはもう見えない／b にはまだ見える
        $this->actingAs($a, 'sanctum')->getJson('/api/announcements')
            ->assertOk()->assertJsonMissing(['id' => $ann->id]);
        $this->actingAs($b, 'sanctum')->getJson('/api/announcements')
            ->assertOk()->assertJsonFragment(['id' => $ann->id]);
    }

    public function test_最後の対象ユーザーが既読にするとお知らせ自体が削除される(): void
    {
        $a   = $this->makeUserWithRole('user');
        $ann = Announcement::create([
            'message'         => '指定向け',
            'target_type'     => 'specific',
            'target_user_ids' => [$a->id],
        ]);

        $this->actingAs($a, 'sanctum')->postJson("/api/announcements/{$ann->id}/read")
            ->assertNoContent();

        $this->assertDatabaseMissing('announcements', ['id' => $ann->id]);
    }

    public function test_対象外ユーザーは既読にできない(): void
    {
        $target = $this->makeUserWithRole('user');
        $other  = $this->makeUserWithRole('user');
        $ann    = Announcement::create([
            'message'         => '指定向け',
            'target_type'     => 'specific',
            'target_user_ids' => [$target->id],
        ]);

        $this->actingAs($other, 'sanctum')->postJson("/api/announcements/{$ann->id}/read")
            ->assertForbidden();

        // 対象は変化せず残る
        $this->assertDatabaseHas('announcements', ['id' => $ann->id]);
        $this->assertSame([$target->id], $ann->refresh()->target_user_ids);
    }

    public function test_all_staff向けは既読対象外で403になる(): void
    {
        $user = $this->makeUserWithRole('user');
        $all  = Announcement::create(['message' => '全員向け', 'target_type' => 'all']);
        $admin = $this->makeUserWithRole('admin');
        $staff = Announcement::create(['message' => 'スタッフ向け', 'target_type' => 'staff']);

        $this->actingAs($user, 'sanctum')->postJson("/api/announcements/{$all->id}/read")
            ->assertForbidden();
        $this->actingAs($admin, 'sanctum')->postJson("/api/announcements/{$staff->id}/read")
            ->assertForbidden();
    }

    public function test_未ログインは既読にできない(): void
    {
        $a   = $this->makeUserWithRole('user');
        $ann = Announcement::create([
            'message'         => '指定向け',
            'target_type'     => 'specific',
            'target_user_ids' => [$a->id],
        ]);

        $this->postJson("/api/announcements/{$ann->id}/read")->assertUnauthorized();
    }
}
