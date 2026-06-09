<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_新規取引希望が来ると出品者に未読が付く(): void
    {
        $seller  = $this->makeUser();
        $buyer   = $this->makeUser();
        $listing = $this->makeListing($seller);

        // 取引希望（メッセージなし）→ チャット作成自体が出品者への通知になる
        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(201);

        // 出品者には未読1件
        $res = $this->actingAs($seller, 'sanctum')->getJson('/api/notifications/summary');
        $res->assertOk();
        $this->assertCount(1, $res->json('unread_chats'));
        $this->assertSame($listing->id, $res->json('unread_chats.0.listing_id'));

        // 取引希望者本人には未読なし
        $res = $this->actingAs($buyer, 'sanctum')->getJson('/api/notifications/summary');
        $this->assertCount(0, $res->json('unread_chats'));
    }

    public function test_最後の発言者の相手にだけ未読が付く(): void
    {
        $seller  = $this->makeUser();
        $buyer   = $this->makeUser();
        $listing = $this->makeListing($seller);

        $chatId = $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->json('id');

        // 出品者が返信 → 未読は買い手側に移る
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chatId}/messages", ['message' => 'こんにちは'])
            ->assertStatus(201);

        $this->assertCount(
            0,
            $this->actingAs($seller, 'sanctum')->getJson('/api/notifications/summary')->json('unread_chats')
        );
        $buyerRes = $this->actingAs($buyer, 'sanctum')->getJson('/api/notifications/summary');
        $this->assertCount(1, $buyerRes->json('unread_chats'));
        $this->assertSame('こんにちは', $buyerRes->json('unread_chats.0.last_message'));
    }

    public function test_掲示板の新着は対象ユーザーにのみ通知される(): void
    {
        $owner = $this->makeUser();
        $other = $this->makeUser();
        $admin = $this->makeUserWithRole('admin');

        // スレッド作成（最初の投稿は owner 本人）
        $threadId = $this->actingAs($owner, 'sanctum')
            ->postJson('/api/board/threads', ['title' => '問い合わせ', 'message' => '本文'])
            ->json('id');

        // admin には新着あり（他人の投稿）、無関係ユーザーには無し、本人にも無し（自分の投稿のため）
        $this->assertNotNull(
            $this->actingAs($admin, 'sanctum')->getJson('/api/notifications/summary')->json('board')
        );
        $this->assertNull(
            $this->actingAs($other, 'sanctum')->getJson('/api/notifications/summary')->json('board')
        );
        $this->assertNull(
            $this->actingAs($owner, 'sanctum')->getJson('/api/notifications/summary')->json('board')
        );

        // admin が返信 → スレッド作成者に新着が付く
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/board/threads/{$threadId}/posts", ['message' => '対応します'])
            ->assertStatus(201);

        $ownerRes = $this->actingAs($owner, 'sanctum')->getJson('/api/notifications/summary');
        $this->assertNotNull($ownerRes->json('board'));
        $this->assertSame('問い合わせ', $ownerRes->json('board.thread_title'));
    }

    public function test_未ログインではアクセスできない(): void
    {
        $this->getJson('/api/notifications/summary')->assertStatus(401);
    }
}
