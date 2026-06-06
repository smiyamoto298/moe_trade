<?php

namespace Database\Factories;

use App\Models\User;
use App\Support\EmailHasher;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // 平文は保存しないため、生成したメールをハッシュ化して格納する。
        // テストで平文が必要な場合は plainEmail を併用するか forPlainEmail() を使う。
        $plain = fake()->unique()->safeEmail();

        return [
            'email' => EmailHasher::hash($plain),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * 指定した平文メールでユーザーを生成する（ハッシュ化して保存）。
     * テストでログイン等に平文が必要な場合に使用する。
     */
    public function forPlainEmail(string $plainEmail): static
    {
        return $this->state(fn (array $attributes) => [
            'email' => EmailHasher::hash($plainEmail),
        ]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
