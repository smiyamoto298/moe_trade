<?php

namespace App\Models;

use App\Support\EmailHasher;
use App\Support\NotificationCategory;
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
        'inventory_storage_mode',
        'push_notify_trade',
        'push_notify_auction',
        'push_notify_expiry',
        'push_notify_listing',
        'push_notify_buying',
        'email_notify_trade',
        'email_notify_auction',
        'email_notify_expiry',
        'email_notify_listing',
        'email_notify_buying',
    ];

    /**
     * 通知設定の既定値。
     *
     * DB側の default だけだと、作成直後のモデルインスタンス（INSERT の戻り）には
     * 値が入らず null（=OFF扱い）に見えてしまうため、モデル側でも既定を持たせる。
     */
    protected $attributes = [
        'push_notify_trade'   => true,
        'push_notify_auction' => true,
        'push_notify_expiry'  => true,
        // 新規出品・新規買取は全件対象のブロードキャストのため既定OFF（オプトイン）
        'push_notify_listing' => false,
        'push_notify_buying'  => false,
        'email_notify_trade'   => true,
        'email_notify_auction' => true,
        'email_notify_expiry'  => true,
        'email_notify_listing' => false,
        'email_notify_buying'  => false,
    ];

    protected $hidden = [
        // email はハッシュ値なので外部に出さない（誤って平文と誤解されるのを防ぐ）
        'email',
        // 通知先メールは復号可能な個人情報。本人向けの通知設定APIだけが明示的に返す
        'notification_email',
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_suspended' => 'boolean',
            // 通知先メールは復号できる必要がある（送信に使うため）。平文では持たず、
            // APP_KEY による暗号化で保存する
            'notification_email' => 'encrypted',
            'notification_email_verified_at' => 'datetime',
            'push_notify_trade' => 'boolean',
            'push_notify_auction' => 'boolean',
            'push_notify_expiry' => 'boolean',
            'push_notify_listing' => 'boolean',
            'push_notify_buying' => 'boolean',
            'email_notify_trade' => 'boolean',
            'email_notify_auction' => 'boolean',
            'email_notify_expiry' => 'boolean',
            'email_notify_listing' => 'boolean',
            'email_notify_buying' => 'boolean',
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

    /**
     * 通知先メールアドレスが、ログイン用アドレス（users.email のハッシュ）と同一か。
     *
     * 同一なら確認メールを別途送らない（アカウントのメール認証で本人確認が済むため）。
     */
    public function notificationEmailIsLoginEmail(): bool
    {
        $email = $this->notification_email;

        return $email !== null && hash_equals($this->email, EmailHasher::hash($email));
    }

    /**
     * 通知先メールアドレスが確認済みで、実際にメール通知を送ってよい状態か。
     *
     * - 別アドレスを指定した場合: 確認メールのリンクを踏むと notification_email_verified_at が入る
     * - ログイン用アドレスと同一の場合: 確認メールは送らず、アカウントのメール認証
     *   （email_verified_at）をもって確認済みとみなす
     *
     * 未確認のアドレスへは一切送らない（第三者のアドレスを登録しての嫌がらせ送信対策）。
     */
    public function hasVerifiedNotificationEmail(): bool
    {
        if ($this->notification_email === null) {
            return false;
        }

        if ($this->notification_email_verified_at !== null) {
            return true;
        }

        return $this->email_verified_at !== null && $this->notificationEmailIsLoginEmail();
    }

    /** 指定種別の Web Push を受け取る設定か。 */
    public function wantsPush(string $category): bool
    {
        return NotificationCategory::isValid($category)
            && (bool) $this->{'push_notify_' . $category};
    }

    /** 指定種別のメール通知を受け取る設定か（宛先が確認済みであることも条件）。 */
    public function wantsEmail(string $category): bool
    {
        return NotificationCategory::isValid($category)
            && (bool) $this->{'email_notify_' . $category}
            && $this->hasVerifiedNotificationEmail();
    }
}
