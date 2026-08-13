<?php

namespace Tests\Unit;

use App\Models\PushSubscription;
use App\Support\WebPushSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Minishlink\WebPush\MessageSentReport;
use Minishlink\WebPush\WebPush;
use Tests\TestCase;

class WebPushSenderTest extends TestCase
{
    use RefreshDatabase;

    private function makeSubscription(int $userId, string $endpoint): PushSubscription
    {
        return PushSubscription::create([
            'user_id'    => $userId,
            'endpoint'   => $endpoint,
            'public_key' => 'pk',
            'auth_token' => 'at',
        ]);
    }

    public function test_VAPID未設定なら送信せず例外も出ない(): void
    {
        $user = $this->makeUser();
        $this->makeSubscription($user->id, 'https://push.example.com/a');
        config(['webpush.vapid.public_key' => null, 'webpush.vapid.private_key' => null]);

        (new WebPushSender())->send($user->id, 'タイトル', '本文');

        // no-op（例外なし・購読もそのまま）
        $this->assertSame(1, PushSubscription::count());
    }

    public function test_購読が無ければクライアントを呼ばない(): void
    {
        $user = $this->makeUser();
        $client = \Mockery::mock(WebPush::class);
        $client->shouldNotReceive('queueNotification');
        $client->shouldNotReceive('flush');

        (new WebPushSender($client))->send($user->id, 'タイトル', '本文');

        $this->assertSame(0, PushSubscription::count());
    }

    public function test_期限切れの購読は送信結果から自動削除される(): void
    {
        $user = $this->makeUser();
        $this->makeSubscription($user->id, 'https://push.example.com/expired');
        $this->makeSubscription($user->id, 'https://push.example.com/alive');

        $expired = \Mockery::mock(MessageSentReport::class);
        $expired->shouldReceive('isSubscriptionExpired')->andReturn(true);
        $expired->shouldReceive('getEndpoint')->andReturn('https://push.example.com/expired');
        $alive = \Mockery::mock(MessageSentReport::class);
        $alive->shouldReceive('isSubscriptionExpired')->andReturn(false);

        $client = \Mockery::mock(WebPush::class);
        $client->shouldReceive('queueNotification')->twice();
        // flush() の戻り値型は Generator のためジェネレータで返す
        $client->shouldReceive('flush')->once()->andReturnUsing(function () use ($expired, $alive) {
            yield $expired;
            yield $alive;
        });

        (new WebPushSender($client))->send($user->id, 'タイトル', '本文');

        $this->assertSame(
            ['https://push.example.com/alive'],
            PushSubscription::pluck('endpoint')->all()
        );
    }

    public function test_トランザクション中の送信はコミット後に実行される(): void
    {
        $user = $this->makeUser();
        $this->makeSubscription($user->id, 'https://push.example.com/a');

        $flushed = false;
        $client = \Mockery::mock(WebPush::class);
        $client->shouldReceive('queueNotification');
        $client->shouldReceive('flush')->andReturnUsing(function () use (&$flushed) {
            $flushed = true;
            return;
            yield; // 空のジェネレータ
        });

        $sender = new WebPushSender($client);
        \Illuminate\Support\Facades\DB::transaction(function () use ($sender, $user, &$flushed) {
            $sender->send($user->id, 'タイトル', '本文');
            $this->assertFalse($flushed, 'トランザクション中は送信されない');
        });

        $this->assertTrue($flushed, 'コミット後に送信される');
    }
}
