<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * 平文メールアドレス（DBには保存しない一時保持用）。
     *
     * users.email 列にはハッシュ（ブラインドインデックス）のみを保存する。
     * メール送信が必要なリクエストでは、POSTで受け取った平文をこのプロパティに
     * セットし、通知の宛先ルーティング（routeNotificationForMail）から参照する。
     * モデルの属性ではないため save() で永続化されることはない。
     */
    public ?string $plainEmail = null;

    protected $fillable = [
        'email',
        'password',
        'role',
        'register_ip',
        'is_suspended',
    ];

    protected $hidden = [
        // email はハッシュ値なので外部に出さない（誤って平文と誤解されるのを防ぐ）
        'email',
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_suspended' => 'boolean',
        ];
    }

    public function characters()
    {
        return $this->hasMany(UserCharacter::class);
    }

    public function listings()
    {
        return $this->hasMany(Listing::class);
    }

    public function moeAccounts()
    {
        return $this->hasMany(MoeAccount::class);
    }

    public function ownedItems()
    {
        return $this->hasMany(OwnedItem::class);
    }

    public function excludedItems()
    {
        return $this->hasMany(UserExcludedItem::class);
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isEditor(): bool
    {
        return in_array($this->role, ['editor', 'admin']);
    }

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new \App\Notifications\VerifyEmailJapanese());
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new \App\Notifications\ResetPasswordJapanese($token));
    }

    /**
     * メール通知の宛先。
     *
     * DBには平文を保存しないため、通知送信時にセットされた一時的な平文
     * （$plainEmail）を宛先として返す。セットされていない場合は送信しない。
     */
    public function routeNotificationForMail($notification = null)
    {
        return $this->plainEmail;
    }
}
