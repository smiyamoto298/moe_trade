<?php

namespace App\Support;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Web Push 送信。
 *
 * - 宛先はユーザーIDのみ。個人情報（メール等）は使わず、push_subscriptions の
 *   エンドポイントへ VAPID 認証付きで暗号化ペイロードを送る。
 * - VAPID 鍵が未設定の環境（テスト等）では no-op。
 * - DBトランザクション中に呼ばれた場合はコミット後に送信する（ロールバック時は送らない）。
 * - 期限切れの購読（410/404）は送信結果から自動削除する。
 * - 送信失敗は警告ログのみでリクエスト処理を止めない。
 */
class WebPushSender
{
    public function __construct(private ?WebPush $client = null)
    {
    }

    /**
     * 指定ユーザーの全購読へ通知を送る。
     *
     * @param  int|null  $userId  宛先ユーザー（null は無視）
     * @param  string    $url     通知クリック時に開くパス
     */
    public function send(?int $userId, string $title, string $body, string $url = '/mypage'): void
    {
        if ($userId === null) {
            return;
        }

        DB::afterCommit(function () use ($userId, $title, $body, $url) {
            $this->sendNow($userId, $title, $body, $url);
        });
    }

    /**
     * コミット待ちをせず即座に送信する。
     *
     * 送信可否（種別ごとの ON/OFF 判定）を済ませた App\Support\Notifier が、
     * 自身の afterCommit の中から呼ぶ。単体で使う場合は send() を使うこと。
     */
    public function sendNow(int $userId, string $title, string $body, string $url = '/mypage'): void
    {
        $subscriptions = PushSubscription::where('user_id', $userId)->get();
        if ($subscriptions->isEmpty()) {
            return;
        }

        $client = $this->client();
        if ($client === null) {
            return;
        }

        try {
            $payload = json_encode(
                ['title' => $title, 'body' => $body, 'url' => $url],
                JSON_UNESCAPED_UNICODE
            );

            foreach ($subscriptions as $sub) {
                $client->queueNotification(
                    Subscription::create([
                        'endpoint'        => $sub->endpoint,
                        'publicKey'       => $sub->public_key,
                        'authToken'       => $sub->auth_token,
                        'contentEncoding' => $sub->content_encoding,
                    ]),
                    $payload
                );
            }

            foreach ($client->flush() as $report) {
                if ($report->isSubscriptionExpired()) {
                    PushSubscription::where('endpoint', $report->getEndpoint())->delete();
                }
            }
        } catch (\Throwable $e) {
            Log::warning("Web Push の送信に失敗しました（user_id={$userId}）: {$e->getMessage()}");
        }
    }

    /** VAPID 設定済みなら WebPush クライアントを返す（未設定なら null = 送信しない）。 */
    protected function client(): ?WebPush
    {
        if ($this->client !== null) {
            return $this->client;
        }

        $publicKey  = config('webpush.vapid.public_key');
        $privateKey = config('webpush.vapid.private_key');
        if (!$publicKey || !$privateKey) {
            return null;
        }

        try {
            return $this->client = new WebPush(
                [
                    'VAPID' => [
                        'subject'    => config('webpush.vapid.subject'),
                        'publicKey'  => $publicKey,
                        'privateKey' => $privateKey,
                    ],
                ],
                [],
                // 死んだエンドポイントでリクエスト処理が長時間ブロックされないよう、
                // タイムアウトを明示した HTTP クライアントを使う（既定の自動検出だと無制限になり得る）
                new \GuzzleHttp\Client(['timeout' => 10, 'connect_timeout' => 5])
            );
        } catch (\Throwable $e) {
            Log::warning('Web Push クライアントの初期化に失敗しました: ' . $e->getMessage());
            return null;
        }
    }
}
