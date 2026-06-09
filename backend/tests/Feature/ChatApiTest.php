<?php

namespace Tests\Feature;

use App\Models\TradeChat;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChatApiTest extends TestCase
{
    use RefreshDatabase;

    private function makeChat(?User $seller = null, ?User $buyer = null, string $status = 'open'): TradeChat
    {
        $seller ??= $this->makeUser();
        $buyer  ??= $this->makeUser();
        $listing = $this->makeListing($seller);

        return TradeChat::create([
            'listing_id' => $listing->id,
            'buyer_id'   => $buyer->id,
            'server'     => 'Emerald',
            'status'     => $status,
        ]);
    }

    public function test_取引希望チャットを作成できる_最初のメッセージ付き(): void
    {
        $buyer   = $this->makeUser();
        $listing = $this->makeListing();

        $res = $this->actingAs($buyer, 'sanctum')->postJson("/api/listings/{$listing->id}/chats", [
            'server'         => 'Emerald',
            'preferred_time' => '21時以降',
            'note'           => 'よろしくお願いします',
        ]);

        $res->assertStatus(201);
        $this->assertStringContainsString('21時以降', $res->json('messages.0.message'));
    }

    public function test_同じ出品に重複してチャットは作られない(): void
    {
        $buyer   = $this->makeUser();
        $listing = $this->makeListing();

        $first = $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald']);
        $second = $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald']);

        $first->assertStatus(201);
        $second->assertStatus(200); // 既存チャットを返す
        $this->assertSame($first->json('id'), $second->json('id'));
        $this->assertSame(1, TradeChat::count());
    }

    public function test_自分の出品には取引希望できない(): void
    {
        $seller  = $this->makeUser();
        $listing = $this->makeListing($seller);

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(400);
    }

    public function test_メール未認証ユーザーは取引希望できない(): void
    {
        $buyer   = User::factory()->unverified()->create();
        $listing = $this->makeListing();

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/listings/{$listing->id}/chats", ['server' => 'Emerald'])
            ->assertStatus(403);
    }

    public function test_当事者以外はチャットを閲覧できない(): void
    {
        $chat     = $this->makeChat();
        $stranger = $this->makeUser();

        $this->actingAs($stranger, 'sanctum')
            ->getJson("/api/chats/{$chat->id}")
            ->assertStatus(403);
    }

    public function test_当事者はメッセージを送信できる(): void
    {
        $seller = $this->makeUser();
        $buyer  = $this->makeUser();
        $chat   = $this->makeChat($seller, $buyer);

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/messages", ['message' => 'こんにちは'])
            ->assertStatus(201);

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/messages", ['message' => 'どうも'])
            ->assertStatus(201);

        $this->assertSame(2, $chat->messages()->count());
    }

    public function test_出品者が取引成立にすると履歴が記録される(): void
    {
        $seller = $this->makeUser(['register_ip' => '203.0.113.1']);
        $buyer  = $this->makeUser();
        $chat   = $this->makeChat($seller, $buyer);

        $res = $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$chat->id}/deal");

        $res->assertOk();
        $this->assertSame('deal', $chat->fresh()->status);
        $this->assertSame('completed', $chat->listing->fresh()->status);

        // 取引履歴が記録され、IPが異なるため相場データとして有効
        $this->assertDatabaseHas('trade_history', [
            'listing_id' => $chat->listing_id,
            'seller_id'  => $seller->id,
            'price'      => 1000,
            'is_valid'   => true,
        ]);
    }

    public function test_出品者と購入者のIPが同一なら相場データは無効(): void
    {
        // テストのリクエスト元IP（127.0.0.1）と同じIPを出品者に設定
        $seller = $this->makeUser(['register_ip' => '127.0.0.1']);
        $chat   = $this->makeChat($seller);

        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$chat->id}/deal")->assertOk();

        $this->assertDatabaseHas('trade_history', [
            'listing_id' => $chat->listing_id,
            'is_valid'   => false,
        ]);
    }

    public function test_購入者は取引成立にできない(): void
    {
        $buyer = $this->makeUser();
        $chat  = $this->makeChat(null, $buyer);

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/deal")
            ->assertStatus(403);
    }

    public function test_双方が取引完了確認できる(): void
    {
        $seller = $this->makeUser();
        $buyer  = $this->makeUser();
        $chat   = $this->makeChat($seller, $buyer, 'deal');

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/complete")
            ->assertOk();
        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/complete")
            ->assertOk();

        $fresh = $chat->fresh();
        $this->assertTrue((bool) $fresh->seller_completed);
        $this->assertTrue((bool) $fresh->buyer_completed);
    }

    public function test_取引不成立で出品がdeal_failedになりチャットはopenに戻る(): void
    {
        $seller = $this->makeUser();
        $chat   = $this->makeChat($seller, null, 'deal');
        $chat->listing->update(['status' => 'completed']);

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/deal-failed")
            ->assertOk();

        $this->assertSame('open', $chat->fresh()->status);
        $this->assertSame('deal_failed', $chat->listing->fresh()->status);
    }

    public function test_取引不成立で履歴が削除される(): void
    {
        $seller = $this->makeUser(['register_ip' => '203.0.113.1']);
        $chat   = $this->makeChat($seller);

        // 取引成立 → 履歴が記録される
        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$chat->id}/deal")->assertOk();
        $this->assertDatabaseHas('trade_history', ['listing_id' => $chat->listing_id]);

        // 取引不成立 → 履歴が削除され相場データに残らない
        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$chat->id}/deal-failed")->assertOk();
        $this->assertDatabaseMissing('trade_history', ['listing_id' => $chat->listing_id]);
    }

    public function test_取引不成立時にrelistで再出品できる(): void
    {
        $seller = $this->makeUser();
        $chat   = $this->makeChat($seller, null, 'deal');
        $chat->listing->update(['status' => 'completed']);

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/deal-failed", ['relist' => true])
            ->assertOk();

        // 同内容の新規出品（active）が作られる
        $this->assertDatabaseHas('listings', [
            'user_id' => $seller->id,
            'item_id' => $chat->listing->item_id,
            'status'  => 'active',
            'price'   => 1000,
        ]);
        $this->assertSame(2, \App\Models\Listing::count());
    }

    public function test_見送りと再オープンができる(): void
    {
        $buyer = $this->makeUser();
        $chat  = $this->makeChat(null, $buyer);

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/decline")
            ->assertOk();
        $this->assertSame('declined', $chat->fresh()->status);

        $this->actingAs($buyer, 'sanctum')
            ->postJson("/api/chats/{$chat->id}/reopen")
            ->assertOk();
        $this->assertSame('open', $chat->fresh()->status);
    }

    public function test_未読チャット数を取得できる(): void
    {
        $seller = $this->makeUser();
        $this->makeChat($seller);            // open
        $this->makeChat($seller, null, 'declined'); // クローズ済みはカウント外

        $this->actingAs($seller, 'sanctum')
            ->getJson('/api/chats/unread-count')
            ->assertOk()
            ->assertJsonPath('unread_count', 1);
    }
}
