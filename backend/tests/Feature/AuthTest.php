<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\VerifyEmailJapanese;
use App\Support\EmailHasher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_新規登録できる_メールはハッシュで保存される(): void
    {
        Notification::fake();

        $res = $this->postJson('/api/auth/register', [
            'email'                 => 'taro@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
            'characters'            => [
                ['server' => 'Emerald', 'character_name' => 'タロウ'],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonStructure(['user' => ['id'], 'token']);

        // 平文メールはDBに保存されず、ブラインドインデックスのみ保存される
        $this->assertDatabaseMissing('users', ['email' => 'taro@example.com']);
        $this->assertDatabaseHas('users', ['email' => EmailHasher::hash('taro@example.com')]);

        // キャラクターが初期登録される
        $this->assertDatabaseHas('user_characters', [
            'server'         => 'Emerald',
            'character_name' => 'タロウ',
        ]);

        // 認証メールが送信される
        $user = User::where('email', EmailHasher::hash('taro@example.com'))->first();
        Notification::assertSentTo($user, VerifyEmailJapanese::class);
    }

    public function test_同じメールアドレスでは二重登録できない(): void
    {
        Notification::fake();
        User::factory()->forPlainEmail('taro@example.com')->create();

        $res = $this->postJson('/api/auth/register', [
            'email'                 => 'taro@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $res->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_メールの大文字小文字や空白は同一として扱う(): void
    {
        Notification::fake();
        User::factory()->forPlainEmail('taro@example.com')->create();

        $res = $this->postJson('/api/auth/register', [
            'email'                 => '  TARO@example.com ',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $res->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_登録した平文メールでログインできる(): void
    {
        User::factory()->forPlainEmail('taro@example.com')->create([
            'password' => 'password123',
        ]);

        $res = $this->postJson('/api/auth/login', [
            'email'    => 'taro@example.com',
            'password' => 'password123',
        ]);

        $res->assertOk()->assertJsonStructure(['user', 'token']);
    }

    public function test_パスワードが違うとログインできない(): void
    {
        User::factory()->forPlainEmail('taro@example.com')->create([
            'password' => 'password123',
        ]);

        $res = $this->postJson('/api/auth/login', [
            'email'    => 'taro@example.com',
            'password' => 'wrong-password',
        ]);

        $res->assertStatus(401);
    }

    public function test_認証必須APIは未ログインだと401(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_自分の情報を取得できる_メールハッシュは含まれない(): void
    {
        $user = $this->makeUser();

        $res = $this->actingAs($user, 'sanctum')->getJson('/api/auth/me');

        $res->assertOk()->assertJsonPath('id', $user->id);
        // email（ハッシュ）はhiddenなのでレスポンスに含まれない
        $res->assertJsonMissingPath('email');
    }

    public function test_認証メール再送はメールアドレスの一致が必要(): void
    {
        Notification::fake();
        $user = User::factory()->forPlainEmail('taro@example.com')->unverified()->create();

        // 不一致 → 422
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/email/resend', ['email' => 'other@example.com'])
            ->assertStatus(422);

        // 一致 → 送信される
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/email/resend', ['email' => 'taro@example.com'])
            ->assertOk();

        Notification::assertSentTo($user, VerifyEmailJapanese::class);
    }

    public function test_認証済みユーザーへの再送は400(): void
    {
        $user = User::factory()->forPlainEmail('taro@example.com')->create();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/email/resend', ['email' => 'taro@example.com'])
            ->assertStatus(400);
    }

    public function test_ログアウトでトークンが失効する(): void
    {
        $user  = $this->makeUser();
        $token = $user->createToken('api')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/auth/logout')
            ->assertOk();

        $this->assertSame(0, $user->tokens()->count());
    }
}
