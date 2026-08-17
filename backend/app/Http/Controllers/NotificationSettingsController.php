<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Notifications\VerifyNotificationEmail;
use App\Support\EmailHasher;
use App\Support\NotificationCategory;
use Illuminate\Http\Request;

/**
 * 通知設定（本人のみ）。
 *
 * - 種別（取引 / オークション / 期限切れ / 新規出品 / 新規買取）× チャネル（Web Push / メール）の ON・OFF
 * - メール通知の宛先アドレスの設定・変更・削除
 *
 * 通知先メールは復号可能な個人情報のため、返すのは常に本人の分だけ。
 * ログイン用アドレス（users.email のハッシュ）と一致する場合は確認メールを送らず、
 * アカウントのメール認証をもって確認済みとみなす（User::hasVerifiedNotificationEmail）。
 */
class NotificationSettingsController extends Controller
{
    public function show(Request $request)
    {
        return response()->json($this->payload($request->user()));
    }

    /** 種別 × チャネルの ON/OFF を更新する。 */
    public function update(Request $request)
    {
        $rules = [];
        foreach (NotificationCategory::all() as $category) {
            $rules["push.{$category}"]  = 'required|boolean';
            $rules["email.{$category}"] = 'required|boolean';
        }
        $data = $request->validate($rules);

        $user = $request->user();
        foreach (NotificationCategory::all() as $category) {
            $user->{'push_notify_' . $category}  = (bool) $data['push'][$category];
            $user->{'email_notify_' . $category} = (bool) $data['email'][$category];
        }
        $user->save();

        return response()->json($this->payload($user));
    }

    /**
     * 通知先メールアドレスを設定・変更する。
     *
     * ログイン用アドレスと一致する場合は確認メールを送らない（アカウントのメール認証で代替）。
     * それ以外は未確認として保存し、確認メールのリンクを踏むまで通知を送らない。
     */
    public function updateEmail(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email:rfc|max:255',
        ]);

        $user  = $request->user();
        $email = trim($data['email']);

        // 同じアドレスで確認済みなら何もしない（確認メールの再送だけを狙った連打対策）
        if ($user->notification_email === $email && $user->hasVerifiedNotificationEmail()) {
            return response()->json($this->payload($user));
        }

        $user->notification_email = $email;
        $isLoginEmail = hash_equals($user->email, EmailHasher::hash($email));
        // 別アドレスに変えた時点で確認済みフラグは落とす（変更前の確認を引き継がせない）
        $user->notification_email_verified_at = null;
        $user->save();

        if (!$isLoginEmail) {
            // 送信時のみ平文を宛先に使う（$plainEmail はDBに保存されない）
            $user->plainEmail = $email;
            $user->notify(new VerifyNotificationEmail($email));
            $user->plainEmail = null;
        }

        return response()->json($this->payload($user));
    }

    /** 通知先メールアドレスを削除する（メール通知は届かなくなる）。 */
    public function destroyEmail(Request $request)
    {
        $user = $request->user();
        $user->notification_email = null;
        $user->notification_email_verified_at = null;
        $user->save();

        return response()->json($this->payload($user));
    }

    /**
     * 確認メールのリンク（署名付きURL）から呼ばれ、通知先メールを確認済みにする。
     *
     * hash は「確認メールを送った時点のアドレス」の sha1。設定を変えた後の古いリンクは
     * 一致しなくなり無効になる。
     */
    public function verifyEmail(Request $request, int $id, string $hash)
    {
        $frontend = rtrim(config('app.frontend_url'), '/') . '/mypage/notifications';

        $user = User::find($id);
        if (!$user || $user->notification_email === null
            || !hash_equals($hash, sha1($user->notification_email))) {
            return redirect($frontend . '?notification_email_verified=error');
        }

        if ($user->notification_email_verified_at === null) {
            $user->notification_email_verified_at = now();
            $user->save();
        }

        return redirect($frontend . '?notification_email_verified=1');
    }

    /**
     * 設定画面へ返す形。
     *
     * status は画面の案内文の出し分けに使う:
     * - none: 宛先未設定（メール通知は届かない）
     * - verified: 確認済み（設定が ON の種別はメールでも届く）
     * - pending_confirmation: 確認メールの返信待ち
     * - pending_account_verification: ログイン用と同じアドレスだが、アカウントのメール認証がまだ
     */
    private function payload(User $user): array
    {
        $push  = [];
        $email = [];
        foreach (NotificationCategory::all() as $category) {
            $push[$category]  = (bool) $user->{'push_notify_' . $category};
            $email[$category] = (bool) $user->{'email_notify_' . $category};
        }

        $verified = $user->hasVerifiedNotificationEmail();
        if ($user->notification_email === null) {
            $status = 'none';
        } elseif ($verified) {
            $status = 'verified';
        } elseif ($user->notificationEmailIsLoginEmail()) {
            $status = 'pending_account_verification';
        } else {
            $status = 'pending_confirmation';
        }

        return [
            'notification_email'          => $user->notification_email,
            'notification_email_verified' => $verified,
            'notification_email_status'   => $status,
            'is_login_email'              => $user->notificationEmailIsLoginEmail(),
            'push'                        => $push,
            'email'                       => $email,
        ];
    }
}
