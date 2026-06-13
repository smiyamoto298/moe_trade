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
}
