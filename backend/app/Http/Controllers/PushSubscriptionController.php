<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Illuminate\Http\Request;

/**
 * Web Push 購読の登録・解除。
 *
 * 保存するのはブラウザが発行した購読情報（エンドポイントURL・暗号化鍵）のみで、
 * メールアドレス等の個人情報は扱わない。endpoint はブラウザごとに一意のため、
 * 同一ブラウザで別ユーザーが購読し直した場合は user_id を付け替える。
 */
class PushSubscriptionController extends Controller
{
    /** フロントが購読時に使う VAPID 公開鍵（未設定なら null = Push 無効）。 */
    public function publicKey()
    {
        return response()->json([
            'public_key' => config('webpush.vapid.public_key'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'endpoint'         => 'required|url|max:500',
            'keys.p256dh'      => 'required|string|max:255',
            'keys.auth'        => 'required|string|max:255',
            'content_encoding' => 'nullable|in:aesgcm,aes128gcm',
        ]);

        $subscription = PushSubscription::updateOrCreate(
            ['endpoint' => $data['endpoint']],
            [
                'user_id'          => $request->user()->id,
                'public_key'       => $data['keys']['p256dh'],
                'auth_token'       => $data['keys']['auth'],
                'content_encoding' => $data['content_encoding'] ?? 'aes128gcm',
            ]
        );

        return response()->json(['id' => $subscription->id], $subscription->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request)
    {
        $data = $request->validate(['endpoint' => 'required|string|max:500']);

        PushSubscription::where('endpoint', $data['endpoint'])
            ->where('user_id', $request->user()->id)
            ->delete();

        return response()->json(['deleted' => true]);
    }
}
