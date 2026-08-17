<?php

namespace Tests\Unit;

use App\Models\User;
use App\Notifications\TradeEventMail;
use App\Support\NotificationCategory;
use App\Support\Notifier;
use App\Support\WebPushSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * 通知の振り分け（App\Support\Notifier）。
 *
 * 種別 × チャネルの ON/OFF と、通知先メールの確認状態に応じて、
 * 送るべきチャネルにだけ配信されることを検証する。
 */
class NotifierTest extends TestCase
{
    use RefreshDatabase;

    /** 通知先メールを確認済みで持つユーザー（ログイン用とは別アドレス）。 */
    private function userWithVerifiedEmail(array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->notification_email = 'notify@example.com';
        $user->notification_email_verified_at = now();
        $user->save();

        return $user;
    }

    private function notifier(): Notifier
    {
        return new Notifier(app(WebPushSender::class));
    }

    public function test_既定では_pushとメールの両方に配信される(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $user = $this->userWithVerifiedEmail();

        (new Notifier($push))->send($user->id, NotificationCategory::TRADE, 'タイトル', '本文', '/mypage?chat=1');

        $push->shouldHaveReceived('sendNow')
            ->withArgs(fn ($uid, $title, $body, $url) => $uid === $user->id && $title === 'タイトル' && $url === '/mypage?chat=1')
            ->once();
        Notification::assertSentTo($user, TradeEventMail::class);
    }

    public function test_pushをOFFにした種別はpushだけ止まりメールは届く(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $user = $this->userWithVerifiedEmail(['push_notify_trade' => false]);

        (new Notifier($push))->send($user->id, NotificationCategory::TRADE, 'タイトル', '本文');

        $push->shouldNotHaveReceived('sendNow');
        Notification::assertSentTo($user, TradeEventMail::class);
    }

    public function test_メールをOFFにした種別はメールだけ止まりpushは届く(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $user = $this->userWithVerifiedEmail(['email_notify_trade' => false]);

        (new Notifier($push))->send($user->id, NotificationCategory::TRADE, 'タイトル', '本文');

        $push->shouldHaveReceived('sendNow')->once();
        Notification::assertNothingSent();
    }

    public function test_ONOFFは種別ごとに独立している(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        // オークションだけ両チャネルOFF
        $user = $this->userWithVerifiedEmail([
            'push_notify_auction'  => false,
            'email_notify_auction' => false,
        ]);
        $notifier = new Notifier($push);

        $notifier->send($user->id, NotificationCategory::AUCTION, 'オークション', '本文');
        $notifier->send($user->id, NotificationCategory::EXPIRY, '期限切れ', '本文');

        $push->shouldHaveReceived('sendNow')
            ->withArgs(fn ($uid, $title) => $title === '期限切れ')
            ->once();
        $push->shouldNotHaveReceived('sendNow', fn ($uid, $title) => $title === 'オークション');
        Notification::assertSentTimes(TradeEventMail::class, 1);
    }

    public function test_通知先メール未設定ならメールは送らない(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $user = User::factory()->create();

        (new Notifier($push))->send($user->id, NotificationCategory::TRADE, 'タイトル', '本文');

        $push->shouldHaveReceived('sendNow')->once();
        Notification::assertNothingSent();
    }

    public function test_未確認の通知先メールには送らない(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $user = User::factory()->create();
        $user->notification_email = 'unverified@example.com';
        $user->save();

        (new Notifier($push))->send($user->id, NotificationCategory::TRADE, 'タイトル', '本文');

        Notification::assertNothingSent();
    }

    public function test_宛先がnullや存在しないユーザーなら何もしない(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $notifier = new Notifier($push);

        $notifier->send(null, NotificationCategory::TRADE, 'タイトル', '本文');
        $notifier->send(999999, NotificationCategory::TRADE, 'タイトル', '本文');

        $push->shouldNotHaveReceived('sendNow');
        Notification::assertNothingSent();
    }

    public function test_未知の種別は配信しない(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $user = $this->userWithVerifiedEmail();

        (new Notifier($push))->send($user->id, 'unknown_category', 'タイトル', '本文');

        $push->shouldNotHaveReceived('sendNow');
        Notification::assertNothingSent();
    }

    public function test_トランザクション中の通知はコミット後に配信される(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $user = $this->userWithVerifiedEmail();
        $notifier = new Notifier($push);

        DB::transaction(function () use ($notifier, $user, $push) {
            $notifier->send($user->id, NotificationCategory::TRADE, 'タイトル', '本文');
            // コミット前には送られない
            $push->shouldNotHaveReceived('sendNow');
            Notification::assertNothingSent();
        });

        $push->shouldHaveReceived('sendNow')->once();
        Notification::assertSentTo($user, TradeEventMail::class);
    }

    public function test_ロールバックされた取引の通知は送らない(): void
    {
        Notification::fake();
        $push = $this->spy(WebPushSender::class);
        $user = $this->userWithVerifiedEmail();
        $notifier = new Notifier($push);

        try {
            DB::transaction(function () use ($notifier, $user) {
                $notifier->send($user->id, NotificationCategory::TRADE, 'タイトル', '本文');
                throw new \RuntimeException('rollback');
            });
        } catch (\RuntimeException) {
            // 想定どおり
        }

        $push->shouldNotHaveReceived('sendNow');
        Notification::assertNothingSent();
    }

    public function test_メール送信に失敗してもリクエストは止まらない(): void
    {
        $push = $this->spy(WebPushSender::class);
        $user = $this->userWithVerifiedEmail();

        Notification::shouldReceive('send')->andThrow(new \RuntimeException('SMTP down'));

        (new Notifier($push))->send($user->id, NotificationCategory::TRADE, 'タイトル', '本文');

        // 例外が伝播せず、push は通常どおり配信されている
        $push->shouldHaveReceived('sendNow')->once();
    }
}
