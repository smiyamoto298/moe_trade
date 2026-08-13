<?php

/*
 * Web Push（VAPID）設定。
 *
 * 鍵は `Minishlink\WebPush\VAPID::createVapidKeys()` で生成し、.env に設定する。
 * 未設定の環境（テスト等）では送信処理が no-op になる（WebPushSender 参照）。
 * 公開鍵はフロントの購読時に `GET /api/push/public-key` で配布する。
 */
return [
    'vapid' => [
        // 購読者への連絡先（サイトURL または mailto:）
        'subject'     => env('VAPID_SUBJECT', 'https://moe-trade.sakuraweb.com'),
        'public_key'  => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
    ],
];
