<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\ResetPasswordJapanese;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_登録済みメールには再設定メールが送信される(): void
    {
        Notification::fake();
        $user = User::factory()->forPlainEmail('taro@example.com')->create();

        $res = $this->postJson('/api/auth/forgot-password', ['email' => 'taro@example.com']);

        $res->assertOk();
        Notification::assertSentTo($user, ResetPasswordJapanese::class);
    }

    public function test_未登録メールでも同一メッセージを返す_アカウント列挙対策(): void
    {
        Notification::fake();
        $user = User::factory()->forPlainEmail('taro@example.com')->create();

        $known   = $this->postJson('/api/auth/forgot-password', ['email' => 'taro@example.com']);
        $unknown = $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com']);

        $known->assertOk();
        $unknown->assertOk();
        $this->assertSame($known->json('message'), $unknown->json('message'));
        // 送信されたのは登録済みメール宛の1通のみ
        Notification::assertSentToTimes($user, ResetPasswordJapanese::class, 1);
    }

    public function test_有効なトークンでパスワードを再設定できる(): void
    {
        $user = User::factory()->forPlainEmail('taro@example.com')->create([
            'password' => 'old-password',
        ]);
        $oldToken = $user->createToken('api');

        $token = Password::broker()->getRepository()->create($user);

        $res = $this->postJson('/api/auth/reset-password', [
            'token'                 => $token,
            'email'                 => 'taro@example.com',
            'password'              => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        $res->assertOk();

        // 新パスワードでログインできる
        $this->assertTrue(Auth::attempt([
            'email'    => 'taro@example.com',
            'password' => 'new-password-123',
        ]));

        // 既存のAPIトークンは全て失効する
        $this->assertSame(0, $user->fresh()->tokens()->count());
    }

    public function test_無効なトークンでは再設定できない(): void
    {
        User::factory()->forPlainEmail('taro@example.com')->create();

        $res = $this->postJson('/api/auth/reset-password', [
            'token'                 => 'invalid-token',
            'email'                 => 'taro@example.com',
            'password'              => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        $res->assertStatus(422);
    }

    public function test_有効期限を過ぎたトークンでは再設定できない(): void
    {
        $user  = User::factory()->forPlainEmail('taro@example.com')->create();
        $token = Password::broker()->getRepository()->create($user);

        // 有効期限（config/auth.php passwords.users.expire = 60分）を過ぎてから再設定を試みる
        $this->travel(61)->minutes();

        $res = $this->postJson('/api/auth/reset-password', [
            'token'                 => $token,
            'email'                 => 'taro@example.com',
            'password'              => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        $res->assertStatus(422);
    }
}
