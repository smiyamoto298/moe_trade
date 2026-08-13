<?php

namespace Tests\Feature;

use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushSubscriptionApiTest extends TestCase
{
    use RefreshDatabase;

    private array $payload = [
        'endpoint' => 'https://push.example.com/sub/abc123',
        'keys'     => ['p256dh' => 'pubkey', 'auth' => 'authtoken'],
    ];

    public function test_未ログインでは購読を登録できない(): void
    {
        $this->postJson('/api/push/subscriptions', $this->payload)->assertStatus(401);
    }

    public function test_購読を登録できる(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/push/subscriptions', $this->payload)
            ->assertStatus(201);

        $this->assertDatabaseHas('push_subscriptions', [
            'user_id'          => $user->id,
            'endpoint'         => 'https://push.example.com/sub/abc123',
            'public_key'       => 'pubkey',
            'auth_token'       => 'authtoken',
            'content_encoding' => 'aes128gcm',
        ]);
    }

    public function test_同一エンドポイントの再登録で購読ユーザーが付け替わる(): void
    {
        $a = $this->makeUser();
        $b = $this->makeUser();

        $this->actingAs($a, 'sanctum')->postJson('/api/push/subscriptions', $this->payload)->assertStatus(201);
        // 同一ブラウザで b がログインし直して購読 → endpoint は同じまま user_id が移る
        $this->actingAs($b, 'sanctum')->postJson('/api/push/subscriptions', $this->payload)->assertStatus(200);

        $this->assertSame(1, PushSubscription::count());
        $this->assertSame($b->id, PushSubscription::first()->user_id);
    }

    public function test_エンドポイントはURL形式が必須(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson('/api/push/subscriptions', [
                'endpoint' => 'not-a-url',
                'keys'     => ['p256dh' => 'k', 'auth' => 'a'],
            ])
            ->assertStatus(422);
    }

    public function test_購読の解除は本人のみできる(): void
    {
        $a = $this->makeUser();
        $b = $this->makeUser();
        PushSubscription::create([
            'user_id'    => $a->id,
            'endpoint'   => 'https://push.example.com/sub/abc123',
            'public_key' => 'k',
            'auth_token' => 't',
        ]);

        // 他人のエンドポイントを指定しても消えない
        $this->actingAs($b, 'sanctum')
            ->deleteJson('/api/push/subscriptions', ['endpoint' => 'https://push.example.com/sub/abc123'])
            ->assertOk();
        $this->assertSame(1, PushSubscription::count());

        // 本人は解除できる
        $this->actingAs($a, 'sanctum')
            ->deleteJson('/api/push/subscriptions', ['endpoint' => 'https://push.example.com/sub/abc123'])
            ->assertOk();
        $this->assertSame(0, PushSubscription::count());
    }

    public function test_VAPID公開鍵を取得できる(): void
    {
        config(['webpush.vapid.public_key' => 'test-public-key']);

        $this->actingAs($this->makeUser(), 'sanctum')
            ->getJson('/api/push/public-key')
            ->assertOk()
            ->assertJson(['public_key' => 'test-public-key']);
    }
}
