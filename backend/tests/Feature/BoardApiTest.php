<?php

namespace Tests\Feature;

use App\Models\BoardThread;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BoardApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_掲示板は未ログインでは利用できない(): void
    {
        $this->getJson('/api/board/threads')->assertStatus(401);
        $this->postJson('/api/board/threads', ['title' => 'x', 'message' => 'y'])->assertStatus(401);
    }

    public function test_スレッドを作成できる_最初の投稿も同時に作られる(): void
    {
        $user = $this->makeUser();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/board/threads', [
            'title'   => '取引相手と連絡が取れません',
            'message' => '対応をお願いします。',
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('title', '取引相手と連絡が取れません')
            ->assertJsonPath('status', 'open')
            ->assertJsonPath('post_count', 1);
    }

    public function test_スレッド一覧と詳細を取得できる(): void
    {
        $user = $this->makeUser();
        $this->actingAs($user, 'sanctum')->postJson('/api/board/threads', [
            'title' => '質問', 'message' => '本文です',
        ]);

        $list = $this->actingAs($user, 'sanctum')->getJson('/api/board/threads');
        $list->assertOk()->assertJsonCount(1, 'data');

        $id = $list->json('data.0.id');
        $this->actingAs($user, 'sanctum')
            ->getJson("/api/board/threads/{$id}")
            ->assertOk()
            ->assertJsonPath('posts.0.message', '本文です');
    }

    public function test_投稿者名はキャラクター名が使われる(): void
    {
        $user = $this->makeUser();
        $user->characters()->create(['server' => 'Emerald', 'character_name' => 'タロウ']);

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/board/threads', [
            'title' => 'テスト', 'message' => '本文',
        ]);

        $res->assertJsonPath('author_name', 'タロウ');
    }

    public function test_キャラクター未登録の投稿者名はユーザーIDになる(): void
    {
        $user = $this->makeUser();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/board/threads', [
            'title' => 'テスト', 'message' => '本文',
        ]);

        $res->assertJsonPath('author_name', "ユーザー#{$user->id}");
    }

    public function test_スレッドに投稿を追加できる(): void
    {
        $author = $this->makeUser();
        $other  = $this->makeUser();
        $this->actingAs($author, 'sanctum')->postJson('/api/board/threads', [
            'title' => 'テスト', 'message' => '本文',
        ]);
        $thread = BoardThread::first();

        $this->actingAs($other, 'sanctum')
            ->postJson("/api/board/threads/{$thread->id}/posts", ['message' => '返信です'])
            ->assertStatus(201)
            ->assertJsonPath('message', '返信です');

        $this->assertSame(2, $thread->posts()->count());
    }

    public function test_ステータス変更はadminのみ(): void
    {
        $user  = $this->makeUser();
        $admin = $this->makeUserWithRole('admin');
        $this->actingAs($user, 'sanctum')->postJson('/api/board/threads', [
            'title' => 'テスト', 'message' => '本文',
        ]);
        $thread = BoardThread::first();

        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/board/threads/{$thread->id}/status", ['status' => 'resolved'])
            ->assertStatus(403);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/board/threads/{$thread->id}/status", ['status' => 'resolved'])
            ->assertOk();

        $this->assertSame('resolved', $thread->fresh()->status);
    }

    public function test_スレッド削除はadminのみ(): void
    {
        $user  = $this->makeUser();
        $admin = $this->makeUserWithRole('admin');
        $this->actingAs($user, 'sanctum')->postJson('/api/board/threads', [
            'title' => 'テスト', 'message' => '本文',
        ]);
        $thread = BoardThread::first();

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/board/threads/{$thread->id}")
            ->assertStatus(403);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/board/threads/{$thread->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('board_threads', ['id' => $thread->id]);
        $this->assertDatabaseMissing('board_posts', ['thread_id' => $thread->id]);
    }
}
