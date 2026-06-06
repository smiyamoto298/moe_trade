<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BoardController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CharacterController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\ListingController;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// 認証不要
Route::prefix('auth')->group(function () {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login',    [AuthController::class, 'login']);
    Route::post('forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('reset-password',  [AuthController::class, 'resetPassword']);
});

// メール認証（署名付きURLで直接アクセス → フロントエンドにリダイレクト）
Route::get('email/verify/{id}/{hash}', function (Request $request, $id, $hash) {
    $user = \App\Models\User::findOrFail($id);

    if (!hash_equals((string) $hash, sha1($user->getEmailForVerification()))) {
        return redirect(rtrim(config('app.frontend_url'), '/') . '/auth/login?verified=error');
    }

    if (!$user->hasVerifiedEmail()) {
        $user->markEmailAsVerified();
    }

    return redirect(rtrim(config('app.frontend_url'), '/') . '/auth/login?verified=1');
})->name('verification.verify');

Route::get('categories',         [CategoryController::class, 'index']);
Route::get('bonus-effect-types', fn() => response()->json(\App\Models\BonusEffectType::orderBy('category')->orderBy('label')->get()));
Route::get('bonus-effect-names', fn() => response()->json(
    \App\Models\ItemBonusEffect::select('effect_name')
        ->distinct()
        ->orderBy('effect_name')
        ->pluck('effect_name')
));

// 付加効果の数値項目ラベル一覧（values[*].label の distinct）
Route::get('bonus-value-labels', function () {
    $labels = \Illuminate\Support\Facades\DB::select("
        SELECT DISTINCT jt.label
        FROM item_bonus_effects,
        JSON_TABLE(`values`, '\$[*]' COLUMNS (label VARCHAR(200) PATH '\$.label')) AS jt
        WHERE jt.label IS NOT NULL AND jt.label != ''
        ORDER BY jt.label
    ");
    return response()->json(array_column($labels, 'label'));
});
Route::get('items',              [ItemController::class, 'index']);
Route::get('items/{id}', [ItemController::class, 'show']);
Route::get('items/{id}/price-analytics', [ItemController::class, 'priceAnalytics']);
Route::get('listings',      [ListingController::class, 'index']);
Route::get('listings/{id}', [ListingController::class, 'show']);

// 認証必須
Route::middleware('auth:sanctum')->group(function () {
    // デバッグ用（開発環境のみ）
    Route::get('debug/me', function (\Illuminate\Http\Request $r) {
        $u = $r->user();
        return response()->json([
            'id' => $u->id,
            'email' => $u->email,
            'verified' => $u->hasVerifiedEmail(),
            'suspended' => $u->is_suspended,
            'role' => $u->role,
        ]);
    });
    Route::post('auth/logout',       [AuthController::class, 'logout']);
    Route::get('auth/me',            [AuthController::class, 'me']);
    Route::post('email/resend',      [AuthController::class, 'resendVerification']);

    // キャラクター
    Route::get('characters',        [CharacterController::class, 'index']);
    Route::post('characters',       [CharacterController::class, 'upsert']);
    Route::delete('characters/{id}', [CharacterController::class, 'destroy']);

    // アイテム
    Route::post('items',              [ItemController::class, 'store']);
    Route::put('items/{id}',          [ItemController::class, 'update']);
    Route::post('items/{id}/verify',  [ItemController::class, 'verify']);
    Route::delete('items/{id}',       [ItemController::class, 'destroy']);

    // カテゴリ
    Route::post('categories', [CategoryController::class, 'store']);

    // マイページ
    Route::get('mypage/listings', function (\Illuminate\Http\Request $request) {
        $listings = \App\Models\Listing::with(['item.category', 'servers'])
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->get();
        return response()->json(['data' => $listings]);
    });
    Route::get('mypage/chats', function (\Illuminate\Http\Request $request) {
        $user  = $request->user()->load('characters');
        $chats = \App\Models\TradeChat::with(['listing.item', 'listing.servers.character', 'messages.user:id,email', 'buyer:id,email'])
            ->where('buyer_id', $user->id)
            ->orderByDesc('updated_at')
            ->get()
            ->map(function ($chat) use ($user) {
                $char = $user->characters->firstWhere('server', $chat->server);
                $chat->buyer_character_name = $char?->character_name;
                return $chat;
            });
        return response()->json($chats);
    });

    // 出品者として受け取ったチャット一覧（listing_id でグループ化）
    Route::get('mypage/selling-chats', function (\Illuminate\Http\Request $request) {
        $chats = \App\Models\TradeChat::with(['messages.user:id,email', 'buyer:id,email', 'buyer.characters'])
            ->whereHas('listing', fn($q) => $q->where('user_id', $request->user()->id))
            ->orderByDesc('updated_at')
            ->get()
            ->map(function ($chat) {
                // チャットのサーバーに対応するバイヤーのキャラクター名を付加
                $char = $chat->buyer?->characters->firstWhere('server', $chat->server);
                $chat->buyer_character_name = $char?->character_name;
                return $chat;
            });

        // listing_id でグループ化して返す
        $grouped = $chats->groupBy('listing_id')->map->values();
        return response()->json($grouped);
    });

    // 出品
    Route::post('listings',              [ListingController::class, 'store']);
    Route::put('listings/{id}',          [ListingController::class, 'update']);
    Route::delete('listings/{id}',       [ListingController::class, 'destroy']);
    Route::post('listings/{id}/renew',   [ListingController::class, 'renew']);
    Route::get('listings/{id}/chats',    [ListingController::class, 'chats']);
    Route::post('listings/{id}/chats',   [ListingController::class, 'createChat']);

    // チャット
    Route::get('chats/unread-count',   [ChatController::class, 'unreadCount']);
    Route::get('chats/{id}',           [ChatController::class, 'show']);
    Route::post('chats/{id}/messages', [ChatController::class, 'sendMessage']);
    Route::post('chats/{id}/deal',        [ChatController::class, 'deal']);
    Route::post('chats/{id}/complete',    [ChatController::class, 'markComplete']);
    Route::post('chats/{id}/deal-failed', [ChatController::class, 'dealFailed']);
    Route::post('chats/{id}/decline',     [ChatController::class, 'decline']);
    Route::post('chats/{id}/reopen',      [ChatController::class, 'reopen']);

    // 運営掲示板（ログイン中の全ユーザーが閲覧・投稿可能）
    Route::get('board/threads',            [BoardController::class, 'index']);
    Route::post('board/threads',           [BoardController::class, 'store']);
    Route::get('board/threads/{id}',       [BoardController::class, 'show']);
    Route::post('board/threads/{id}/posts',[BoardController::class, 'storePost']);

    // 運営掲示板：管理者のみ（状態変更・削除）
    Route::middleware('role:admin')->group(function () {
        Route::patch('board/threads/{id}/status', [BoardController::class, 'updateStatus']);
        Route::delete('board/threads/{id}',        [BoardController::class, 'destroyThread']);
        Route::delete('board/posts/{id}',          [BoardController::class, 'destroyPost']);
    });

    // 管理（editor/admin）
    Route::middleware('role:editor')->group(function () {
        Route::get('admin/users',                [AdminController::class, 'users']);
        Route::put('admin/users/{id}/role',      [AdminController::class, 'updateRole']);
        Route::post('admin/users/{id}/suspend',  [AdminController::class, 'suspend']);
        Route::post('admin/users/{id}/unsuspend',[AdminController::class, 'unsuspend']);
    });
});
