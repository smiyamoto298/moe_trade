<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\VerifyNotificationEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

/**
 * 通知設定API（種別 × チャネルの ON/OFF・メール通知の宛先の設定と確認）。
 *
 * 通知先メールは復号可能な個人情報のため、公開境界（未ログイン・他人の設定を
 * 触れないこと）と、未確認アドレスへ送らないことを重点的に検証する。
 */
class NotificationSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_未ログインでは通知設定を取得できない(): void
    {
        $this->getJson('/api/notification-settings')->assertStatus(401);
        $this->putJson('/api/notification-settings')->assertStatus(401);
        $this->putJson('/api/notification-settings/email', ['email' => 'a@example.com'])->assertStatus(401);
        $this->deleteJson('/api/notification-settings/email')->assertStatus(401);
    }

    public function test_既定では自分宛て種別がONで新規出品買取はOFF_通知先メールは未設定(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->getJson('/api/notification-settings')
            ->assertOk()
            ->assertJson([
                'notification_email'          => null,
                'notification_email_verified' => false,
                'notification_email_status'   => 'none',
                // 新規出品・新規買取は全件対象のブロードキャストのため既定OFF（オプトイン）
                'push'  => ['trade' => true, 'auction' => true, 'expiry' => true, 'listing' => false, 'buying' => false],
                'email' => ['trade' => true, 'auction' => true, 'expiry' => true, 'listing' => false, 'buying' => false],
            ]);
    }

    public function test_種別ごとにチャネル別のONOFFを更新できる(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notification-settings', [
                'push'  => ['trade' => true,  'auction' => false, 'expiry' => true,  'listing' => true,  'buying' => false],
                'email' => ['trade' => false, 'auction' => true,  'expiry' => false, 'listing' => false, 'buying' => true],
            ])
            ->assertOk()
            ->assertJson([
                'push'  => ['trade' => true,  'auction' => false, 'expiry' => true,  'listing' => true,  'buying' => false],
                'email' => ['trade' => false, 'auction' => true,  'expiry' => false, 'listing' => false, 'buying' => true],
            ]);

        $user->refresh();
        $this->assertTrue($user->push_notify_trade);
        $this->assertFalse($user->push_notify_auction);
        $this->assertFalse($user->email_notify_trade);
        $this->assertTrue($user->email_notify_auction);
        $this->assertTrue($user->push_notify_listing);
        $this->assertFalse($user->push_notify_buying);
        $this->assertFalse($user->email_notify_listing);
        $this->assertTrue($user->email_notify_buying);
    }

    public function test_ONOFFの指定漏れはバリデーションエラー(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->putJson('/api/notification-settings', ['push' => ['trade' => true]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['push.auction', 'push.expiry', 'push.listing', 'push.buying', 'email.trade']);
    }

    public function test_ログイン用と別のアドレスは確認メールが送られ確認まで未確認扱い(): void
    {
        Notification::fake();
        $user = User::factory()->forPlainEmail('login@example.com')->create();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notification-settings/email', ['email' => 'notify@example.com'])
            ->assertOk()
            ->assertJson([
                'notification_email'          => 'notify@example.com',
                'notification_email_verified' => false,
                'notification_email_status'   => 'pending_confirmation',
                'is_login_email'              => false,
            ]);

        Notification::assertSentTo($user, VerifyNotificationEmail::class);
        $this->assertFalse($user->fresh()->hasVerifiedNotificationEmail());
    }

    public function test_ログイン用と同じアドレスなら確認メールを送らず即座に有効(): void
    {
        Notification::fake();
        $user = User::factory()->forPlainEmail('login@example.com')->create();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notification-settings/email', ['email' => 'login@example.com'])
            ->assertOk()
            ->assertJson([
                'notification_email_verified' => true,
                'notification_email_status'   => 'verified',
                'is_login_email'              => true,
            ]);

        Notification::assertNothingSent();
    }

    public function test_ログイン用と同じでもアカウント未認証なら通知は届かない(): void
    {
        Notification::fake();
        $user = User::factory()->unverified()->forPlainEmail('login@example.com')->create();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notification-settings/email', ['email' => 'login@example.com'])
            ->assertOk()
            ->assertJson([
                'notification_email_verified' => false,
                'notification_email_status'   => 'pending_account_verification',
            ]);

        // アカウントのメール認証が済めば確認済みになる
        $user->fresh()->markEmailAsVerified();
        $this->assertTrue($user->fresh()->hasVerifiedNotificationEmail());
    }

    public function test_確認リンクで通知先メールが確認済みになる(): void
    {
        Notification::fake();
        $user = User::factory()->forPlainEmail('login@example.com')->create();
        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notification-settings/email', ['email' => 'notify@example.com']);

        $this->get($this->verifyUrl($user->id, 'notify@example.com'))
            ->assertRedirectContains('notification_email_verified=1');

        $this->assertNotNull($user->fresh()->notification_email_verified_at);
        $this->assertTrue($user->fresh()->hasVerifiedNotificationEmail());
    }

    public function test_署名のないリンクや別アドレスのリンクでは確認できない(): void
    {
        Notification::fake();
        $user = User::factory()->forPlainEmail('login@example.com')->create();
        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notification-settings/email', ['email' => 'notify@example.com']);

        // 署名なし
        $this->get("/api/notification-email/verify/{$user->id}/" . sha1('notify@example.com'))
            ->assertStatus(403);

        // 署名はあるが、現在の設定と違うアドレスのハッシュ（変更前の古いリンク）
        $this->get($this->verifyUrl($user->id, 'old@example.com'))
            ->assertRedirectContains('notification_email_verified=error');

        $this->assertNull($user->fresh()->notification_email_verified_at);
    }

    public function test_アドレスを変更すると確認済みが解除され再度確認が必要になる(): void
    {
        Notification::fake();
        $user = User::factory()->forPlainEmail('login@example.com')->create();
        $user->notification_email = 'notify@example.com';
        $user->notification_email_verified_at = now();
        $user->save();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notification-settings/email', ['email' => 'other@example.com'])
            ->assertOk()
            ->assertJson(['notification_email_status' => 'pending_confirmation']);

        $this->assertNull($user->fresh()->notification_email_verified_at);
        Notification::assertSentTo($user, VerifyNotificationEmail::class);
    }

    public function test_通知先メールを削除できる(): void
    {
        $user = $this->makeUser();
        $user->notification_email = 'notify@example.com';
        $user->notification_email_verified_at = now();
        $user->save();

        $this->actingAs($user, 'sanctum')
            ->deleteJson('/api/notification-settings/email')
            ->assertOk()
            ->assertJson([
                'notification_email'        => null,
                'notification_email_status' => 'none',
            ]);

        $this->assertNull($user->fresh()->notification_email);
        $this->assertFalse($user->fresh()->hasVerifiedNotificationEmail());
    }

    public function test_不正な形式のアドレスは拒否される(): void
    {
        $this->actingAs($this->makeUser(), 'sanctum')
            ->putJson('/api/notification-settings/email', ['email' => 'not-an-email'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_通知先メールは平文でDBに保存されない(): void
    {
        Notification::fake();
        $user = $this->makeUser();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/notification-settings/email', ['email' => 'secret@example.com']);

        $raw = \DB::table('users')->where('id', $user->id)->value('notification_email');
        $this->assertNotSame('secret@example.com', $raw);
        $this->assertStringNotContainsString('secret@example.com', (string) $raw);
        // 復号すれば取り出せる（送信に使えることの確認）
        $this->assertSame('secret@example.com', $user->fresh()->notification_email);
    }

    public function test_他人の設定は自分の設定に影響しない(): void
    {
        $me    = $this->makeUser();
        $other = $this->makeUser();
        $other->notification_email = 'other@example.com';
        $other->save();

        $this->actingAs($me, 'sanctum')
            ->getJson('/api/notification-settings')
            ->assertOk()
            ->assertJson(['notification_email' => null]);
    }

    private function verifyUrl(int $userId, string $email): string
    {
        return URL::temporarySignedRoute(
            'notification-email.verify',
            now()->addMinutes(60),
            ['id' => $userId, 'hash' => sha1($email)]
        );
    }
}
