<?php

namespace Tests\Feature;

use App\Models\Listing;
use App\Models\TradeChat;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 取引希望の「順番待ち（先着順キュー）」機能のテスト。
 *   - 出品/買取に複数の取引希望があるとき、先着順で先頭のみ対応可能。
 *   - 2番目以降は owner からは匿名・操作不可。
 *   - 先頭を見送ると次が繰り上がる。
 *   - 出品/買取詳細に waiting_count（待ち人数）が付く。
 */
class TradeQueueTest extends TestCase
{
    use RefreshDatabase;

    /** 同一出品に、created_at をずらした open チャットを order の順に作る。 */
    private function makeQueue(Listing $listing, User ...$buyers): array
    {
        $chats = [];
        foreach ($buyers as $i => $buyer) {
            $chats[] = TradeChat::create([
                'listing_id' => $listing->id,
                'buyer_id'   => $buyer->id,
                'server'     => 'Emerald',
                'status'     => 'open',
                'created_at' => now()->addSeconds($i),
                'updated_at' => now()->addSeconds($i),
            ]);
        }
        return $chats;
    }

    public function test_先頭のチャットのみ取引成立できる(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$first, $second] = $this->makeQueue($listing, $this->makeUser(), $this->makeUser());

        // 2番目（順番待ち）は成立できない
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$second->id}/deal")
            ->assertStatus(400);
        $this->assertSame('open', $second->fresh()->status);

        // 先頭は成立できる
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$first->id}/deal")
            ->assertOk();
        $this->assertSame('deal', $first->fresh()->status);
    }

    public function test_先頭以外は見送りできない_owner(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$first, $second] = $this->makeQueue($listing, $this->makeUser(), $this->makeUser());

        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$second->id}/decline")
            ->assertStatus(400);

        // 先頭を見送ると、2番目が繰り上がって成立できるようになる
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$first->id}/decline")
            ->assertOk();
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$second->id}/deal")
            ->assertOk();
        $this->assertSame('deal', $second->fresh()->status);
    }

    public function test_owner_は順番待ちチャットを閲覧すると匿名化される(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        [, $second] = $this->makeQueue($listing, $this->makeUser(), $this->makeUser());
        $second->messages()->create(['user_id' => $second->buyer_id, 'message' => '秘密のメッセージ']);

        $res = $this->actingAs($seller, 'sanctum')->getJson("/api/chats/{$second->id}");
        $res->assertOk();
        $this->assertNull($res->json('buyer'));
        $this->assertSame([], $res->json('messages'));
        $this->assertTrue($res->json('is_locked'));
    }

    public function test_先頭の取引希望者は自分のチャットを閲覧できる(): void
    {
        $seller = $this->makeUser();
        $buyer = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$first] = $this->makeQueue($listing, $buyer, $this->makeUser());

        // 取引希望者本人は順番に関わらず自分のチャットを閲覧可能
        $this->actingAs($buyer, 'sanctum')
            ->getJson("/api/chats/{$first->id}")
            ->assertOk();
    }

    public function test_順番待ちの取引希望者も自分のチャットを閲覧できる(): void
    {
        $seller = $this->makeUser();
        $waitingBuyer = $this->makeUser();
        $listing = $this->makeListing($seller);
        [, $second] = $this->makeQueue($listing, $this->makeUser(), $waitingBuyer);

        $res = $this->actingAs($waitingBuyer, 'sanctum')->getJson("/api/chats/{$second->id}");
        $res->assertOk();
        // 本人なので匿名化されない
        $this->assertNotNull($res->json('buyer'));
    }

    public function test_出品詳細に待ち人数が付く(): void
    {
        $listing = $this->makeListing();
        $this->makeQueue($listing, $this->makeUser(), $this->makeUser(), $this->makeUser());

        $res = $this->getJson("/api/listings/{$listing->id}");
        $res->assertOk();
        $this->assertSame(3, $res->json('waiting_count'));
    }

    public function test_取引成立しても次の順番待ちは進まずロックのまま(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$first, $second] = $this->makeQueue($listing, $this->makeUser(), $this->makeUser());

        // 先頭を取引成立
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$first->id}/deal")
            ->assertOk();

        // 2番目はまだ順番待ちのまま（取引成立できない）
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$second->id}/deal")
            ->assertStatus(400);

        // 出品者の一覧で2番目はロック（匿名）のまま
        $res = $this->actingAs($seller, 'sanctum')->getJson('/api/mypage/selling-chats');
        $row = collect($res->json($listing->id))->firstWhere('id', $second->id);
        $this->assertTrue($row['is_locked']);
    }

    public function test_取引不成立で次の順番待ちに進む(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$first, $second] = $this->makeQueue($listing, $this->makeUser(), $this->makeUser());

        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$first->id}/deal")->assertOk();
        // 取引不成立 → 残りの順番待ちがあるので出品は active に戻る（再出品しない）
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$first->id}/deal-failed", ['relist' => true])
            ->assertOk();

        $this->assertSame('active', $listing->fresh()->status);
        // 再出品されていない（出品は1件のまま）
        $this->assertSame(1, Listing::count());

        // 2番目が先頭に繰り上がり、取引成立できる
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$second->id}/deal")
            ->assertOk();
        $this->assertSame('deal', $second->fresh()->status);
    }

    public function test_順番待ちが無い時の取引不成立は従来通り再出品できる(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$only] = $this->makeQueue($listing, $this->makeUser());

        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$only->id}/deal")->assertOk();
        $this->actingAs($seller, 'sanctum')
            ->postJson("/api/chats/{$only->id}/deal-failed", ['relist' => true])
            ->assertOk();

        // 順番待ちが無いので deal_failed になり、再出品で新しい出品が作られる
        $this->assertSame('deal_failed', $listing->fresh()->status);
        $this->assertSame(2, Listing::count());
    }

    public function test_受け渡し完了で残りの順番待ちは見送りになる(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$first, $second, $third] = $this->makeQueue($listing, $this->makeUser(), $this->makeUser(), $this->makeUser());

        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$first->id}/deal")->assertOk();
        // 取引成立しただけでは順番待ちは open のまま
        $this->assertSame('open', $second->fresh()->status);

        // 出品者が受け渡し完了 → 残りの順番待ちが見送り(declined)になる
        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$first->id}/complete")->assertOk();
        $this->assertSame('declined', $second->fresh()->status);
        $this->assertSame('declined', $third->fresh()->status);
        // 成立チャット自体は deal のまま（seller_completed=true）
        $this->assertSame('deal', $first->fresh()->status);
        $this->assertTrue((bool) $first->fresh()->seller_completed);
    }

    public function test_買い手側の受け渡し完了では順番待ちは見送りにならない(): void
    {
        $seller = $this->makeUser();
        $buyer = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$first, $second] = $this->makeQueue($listing, $buyer, $this->makeUser());

        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$first->id}/deal")->assertOk();
        // 取引希望者（買い手）側の完了では順番待ちは見送りにしない（出品者の完了を待つ）
        $this->actingAs($buyer, 'sanctum')->postJson("/api/chats/{$first->id}/complete")->assertOk();
        $this->assertSame('open', $second->fresh()->status);
    }

    public function test_取引成立中は順番待ちは未読通知に含まれない(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        [$first, $second] = $this->makeQueue($listing, $this->makeUser(), $this->makeUser());

        // deal 前：先頭は通知対象、2番目は対象外
        $res = $this->actingAs($seller, 'sanctum')->getJson('/api/notifications/summary');
        $ids = collect($res->json('unread_chats'))->pluck('chat_id');
        $this->assertTrue($ids->contains($first->id));
        $this->assertFalse($ids->contains($second->id));

        // deal 後：2番目は依然として通知対象外（順番待ちのまま）
        $this->actingAs($seller, 'sanctum')->postJson("/api/chats/{$first->id}/deal")->assertOk();
        $res = $this->actingAs($seller, 'sanctum')->getJson('/api/notifications/summary');
        $ids = collect($res->json('unread_chats'))->pluck('chat_id');
        $this->assertFalse($ids->contains($second->id));
    }

    public function test_出品一覧に待ち人数が付く(): void
    {
        $listing = $this->makeListing();
        $this->makeQueue($listing, $this->makeUser(), $this->makeUser());

        $res = $this->getJson('/api/listings');
        $res->assertOk();
        $row = collect($res->json('data'))->firstWhere('id', $listing->id);
        $this->assertSame(2, $row['waiting_count']);
    }

    public function test_出品者の取引希望一覧で2番目以降は匿名化される(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        $this->makeQueue($listing, $this->makeUser(), $this->makeUser());

        $res = $this->actingAs($seller, 'sanctum')->getJson('/api/mypage/selling-chats');
        $res->assertOk();
        $group = $res->json($listing->id);

        // 先頭（queue_position=1）は匿名化されず、2番目は is_locked=true
        $positions = collect($group)->keyBy('queue_position');
        $this->assertFalse($positions[1]['is_locked']);
        $this->assertTrue($positions[2]['is_locked']);
        $this->assertNull($positions[2]['buyer']);
        $this->assertSame(2, $positions[1]['queue_total']);
    }

    public function test_取引希望一覧で自分の順番が付く(): void
    {
        $seller = $this->makeUser();
        $listing = $this->makeListing($seller);
        $buyer1 = $this->makeUser();
        $buyer2 = $this->makeUser();
        $this->makeQueue($listing, $buyer1, $buyer2);

        // 2番目の取引希望者から見た自分のチャット
        $res = $this->actingAs($buyer2, 'sanctum')->getJson('/api/mypage/chats');
        $res->assertOk();
        $mine = collect($res->json())->firstWhere('listing_id', $listing->id);
        $this->assertSame(2, $mine['queue_position']);
        $this->assertSame(2, $mine['queue_total']);
    }
}
