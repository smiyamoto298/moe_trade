<?php

namespace App\Support;

use App\Models\User;
use App\Notifications\TradeEventMail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * 通知の配信口（Web Push / メール）。
 *
 * 各コントローラ・バッチはこのクラスだけを呼ぶ。宛先ユーザーの設定
 * （種別 × チャネルの ON/OFF、通知先メールの確認状態）を見て、
 * 有効なチャネルにだけ配信する。
 *
 * - 宛先の指定はユーザーIDのみ。呼び出し側は個人情報を扱わない。
 * - DBトランザクション中に呼ばれた場合はコミット後に配信する
 *   （ロールバックされた取引の通知を送ってしまわないため）。
 * - 配信失敗は警告ログのみでリクエスト処理を止めない。
 */
class Notifier
{
    public function __construct(private WebPushSender $push)
    {
    }

    /**
     * 指定ユーザーへ通知する。
     *
     * @param  int|null  $userId    宛先ユーザー（null は無視）
     * @param  string    $category  NotificationCategory の種別
     * @param  string    $url       通知クリック時に開くパス（メールのボタンにも使う）
     */
    public function send(?int $userId, string $category, string $title, string $body, string $url = '/mypage'): void
    {
        if ($userId === null) {
            return;
        }

        if (!NotificationCategory::isValid($category)) {
            Log::warning("未知の通知種別です: {$category}");
            return;
        }

        DB::afterCommit(function () use ($userId, $category, $title, $body, $url) {
            $user = User::find($userId);
            if ($user === null) {
                return;
            }

            if ($user->wantsPush($category)) {
                $this->push->sendNow($userId, $title, $body, $url);
            }

            if ($user->wantsEmail($category)) {
                $this->sendMail($user, $title, $body, $url);
            }
        });
    }

    /**
     * 指定種別を ON にしている全ユーザーへ通知する（新規出品・新規買取などの全体向け）。
     *
     * 宛先は「push かメールのどちらかを ON にしているユーザー」だけを DB 側で絞り込む
     * （該当種別は既定 OFF のため、全ユーザーを走査せずに済む）。チャネルごとの最終
     * 判定は send() と同じく wantsPush / wantsEmail に委ねる。
     *
     * @param  int|null  $excludeUserId  除外するユーザー（作成者本人など）
     */
    public function broadcast(string $category, string $title, string $body, string $url = '/mypage', ?int $excludeUserId = null): void
    {
        if (!NotificationCategory::isValid($category)) {
            Log::warning("未知の通知種別です: {$category}");
            return;
        }

        DB::afterCommit(function () use ($category, $title, $body, $url, $excludeUserId) {
            User::query()
                ->where(function ($query) use ($category) {
                    $query->where('push_notify_' . $category, true)
                        ->orWhere('email_notify_' . $category, true);
                })
                ->when($excludeUserId !== null, fn ($query) => $query->where('id', '!=', $excludeUserId))
                ->each(function (User $user) use ($category, $title, $body, $url) {
                    if ($user->wantsPush($category)) {
                        $this->push->sendNow($user->id, $title, $body, $url);
                    }

                    if ($user->wantsEmail($category)) {
                        $this->sendMail($user, $title, $body, $url);
                    }
                });
        });
    }

    /**
     * 通知先メールへ送る。
     *
     * 平文アドレスはDBに保存されている暗号化列を復号して一時的に $plainEmail へ渡す
     * （routeNotificationForMail がここを見る）。キューワーカーを常設していないため
     * 同期送信し、失敗はログのみでリクエストを止めない。
     */
    protected function sendMail(User $user, string $title, string $body, string $url): void
    {
        try {
            $user->plainEmail = $user->notification_email;
            $user->notify(new TradeEventMail($title, $body, $url));
        } catch (\Throwable $e) {
            Log::warning("メール通知の送信に失敗しました（user_id={$user->id}）: {$e->getMessage()}");
        } finally {
            // 後続処理へ平文が残らないようにする
            $user->plainEmail = null;
        }
    }
}
