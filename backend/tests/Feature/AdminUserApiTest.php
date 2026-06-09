<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminUserApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_一般ユーザーは管理APIにアクセスできない(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user, 'sanctum')->getJson('/api/admin/users')->assertStatus(403);
    }

    public function test_editorは管理APIにアクセスできない_admin限定(): void
    {
        $editor = $this->makeUserWithRole('editor');
        $target = $this->makeUser();

        $this->actingAs($editor, 'sanctum')->getJson('/api/admin/users')->assertStatus(403);
        $this->actingAs($editor, 'sanctum')
            ->putJson("/api/admin/users/{$target->id}/role", ['role' => 'editor'])
            ->assertStatus(403);
        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/admin/users/{$target->id}/suspend")
            ->assertStatus(403);
    }

    public function test_adminはユーザー一覧を取得できる(): void
    {
        $admin = $this->makeUserWithRole('admin');
        $this->makeUser();

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/users');

        $res->assertOk();
        $this->assertCount(2, $res->json());
    }

    public function test_権限を変更できる(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $target = $this->makeUser();

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/users/{$target->id}/role", ['role' => 'editor'])
            ->assertOk();

        $this->assertSame('editor', $target->fresh()->role);
    }

    public function test_不正な権限値は拒否される(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $target = $this->makeUser();

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/users/{$target->id}/role", ['role' => 'superuser'])
            ->assertStatus(422);
    }

    public function test_利用停止と解除ができる(): void
    {
        $admin  = $this->makeUserWithRole('admin');
        $target = $this->makeUser();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$target->id}/suspend")
            ->assertOk();
        $this->assertTrue($target->fresh()->is_suspended);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$target->id}/unsuspend")
            ->assertOk();
        $this->assertFalse($target->fresh()->is_suspended);
    }
}
