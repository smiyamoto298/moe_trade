<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BoardController;
use App\Http\Controllers\BonusValueLabelController;
use App\Http\Controllers\BuyRequestController;
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

Route::get('announcements',      [AnnouncementController::class, 'index']);
Route::get('categories',         [CategoryController::class, 'index']);
Route::get('bonus-effect-types', fn() => response()->json(\App\Models\BonusEffectType::orderBy('category')->orderBy('label')->get()));
Route::get('bonus-effect-names', fn() => response()->json(
    \App\Models\ItemBonusEffect::select('effect_name')
        ->distinct()
        ->orderBy('effect_name')
        ->pluck('effect_name')
));

// 付加効果の「項目名」候補一覧。アイテム登録フォームの datalist と
// 一覧の絞り込み候補に使用。管理者・編集者が管理画面で編集する。
Route::get('bonus-value-labels', [\App\Http\Controllers\BonusValueLabelController::class, 'index']);
Route::get('items',              [ItemController::class, 'index']);
Route::get('items/{id}', [ItemController::class, 'show']);
Route::get('items/{id}/price-analytics', [ItemController::class, 'priceAnalytics']);
Route::get('listings',      [ListingController::class, 'index']);
Route::get('listings/{id}', [ListingController::class, 'show']);
Route::get('buy-requests',      [BuyRequestController::class, 'index']);
Route::get('buy-requests/{id}', [BuyRequestController::class, 'show']);

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
    Route::post('characters/default', [CharacterController::class, 'setDefault']);
    Route::delete('characters/{id}', [CharacterController::class, 'destroy']);

    // アイテム
    Route::post('items/match',        [ItemController::class, 'matchNames']);
    Route::post('items',              [ItemController::class, 'store']);
    Route::put('items/{id}',          [ItemController::class, 'update']);
    Route::post('items/{id}/verify',  [ItemController::class, 'verify'])->middleware('role:editor');
    // 相場登録は admin のみ（editor は不可）
    Route::post('items/{id}/market-prices', [ItemController::class, 'storeMarketPrice'])->middleware('role:admin');
    Route::delete('items/{id}',       [ItemController::class, 'destroy'])->middleware('role:admin');
    Route::post('items/{id}/merge',   [ItemController::class, 'merge'])->middleware('role:admin');

    // カテゴリ
    Route::post('categories', [CategoryController::class, 'store']);

    // マイページ
    Route::get('mypage/listings', function (\Illuminate\Http\Request $request) {
        $listings = \App\Models\Listing::with(['item.category', 'servers', 'user:id,email', 'user.characters'])
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->get()
            ->each(fn(\App\Models\Listing $l) => $l->resolveServerContacts());
        return response()->json(['data' => $listings]);
    });
    Route::get('mypage/chats', function (\Illuminate\Http\Request $request) {
        $user  = $request->user()->load('characters');
        // 出品に対する取引希望（＝自分が買い手）。買取由来のチャットは含めない。
        $chats = \App\Models\TradeChat::with(['listing.item.category', 'listing.servers', 'listing.user:id,email', 'listing.user.characters', 'messages.user:id,email', 'buyer:id,email'])
            ->where('buyer_id', $user->id)
            ->whereNotNull('listing_id')
            ->orderByDesc('updated_at')
            ->get()
            ->map(function ($chat) use ($user) {
                // 出品の連絡先キャラ名（出品者の現在のキャラクター）を解決
                $chat->listing?->resolveServerContacts();
                // 自分（買い手）のそのサーバーでのキャラ名
                $char = $user->characters->firstWhere('server', $chat->server);
                $chat->buyer_character_name = $char?->character_name;
                return $chat;
            });
        // 取引希望の順番待ち（出品の open キュー内での自分の順位・待ち人数）を付与
        \App\Models\TradeChat::annotateBuyerQueue($chats, 'listing_id');
        return response()->json($chats);
    });

    // 自分のアクティブな出品・買取の件数（item_id ごと）。登録時の重複案内に使用。
    Route::get('mypage/item-counts', function (\Illuminate\Http\Request $request) {
        $uid = $request->user()->id;
        $listings = \App\Models\Listing::where('user_id', $uid)
            ->where('status', 'active')
            ->selectRaw('item_id, COUNT(*) as c')
            ->groupBy('item_id')
            ->pluck('c', 'item_id');
        $buyRequests = \App\Models\BuyRequest::where('user_id', $uid)
            ->where('status', 'active')
            ->selectRaw('item_id, COUNT(*) as c')
            ->groupBy('item_id')
            ->pluck('c', 'item_id');
        return response()->json([
            'listings'      => (object) $listings,
            'buy_requests'  => (object) $buyRequests,
        ]);
    });

    // 自分の買取一覧
    Route::get('mypage/buy-requests', function (\Illuminate\Http\Request $request) {
        $buyRequests = \App\Models\BuyRequest::with(['item.category', 'servers', 'user:id,email', 'user.characters'])
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->get()
            ->each(fn(\App\Models\BuyRequest $b) => $b->resolveServerContacts());
        return response()->json(['data' => $buyRequests]);
    });

    // 買取登録者として受け取ったチャット一覧（buy_request_id でグループ化）
    Route::get('mypage/buy-request-chats', function (\Illuminate\Http\Request $request) {
        $chats = \App\Models\TradeChat::with(['messages.user:id,email', 'buyer:id,email', 'buyer.characters'])
            ->whereHas('buyRequest', fn($q) => $q->where('user_id', $request->user()->id))
            ->orderByDesc('updated_at')
            ->get()
            ->map(function ($chat) {
                // チャットのサーバーに対応する相手（売り手）のキャラクター名を付加
                $char = $chat->buyer?->characters->firstWhere('server', $chat->server);
                $chat->buyer_character_name = $char?->character_name;
                return $chat;
            });

        $grouped = $chats->groupBy('buy_request_id')
            ->map(fn($group) => \App\Models\TradeChat::annotateOwnerQueue($group->values()));
        return response()->json($grouped);
    });

    // 買取への取引希望（＝自分が売り手として申し出たチャット）
    Route::get('mypage/selling-offers', function (\Illuminate\Http\Request $request) {
        $user  = $request->user()->load('characters');
        $chats = \App\Models\TradeChat::with(['buyRequest.item.category', 'buyRequest.servers', 'buyRequest.user:id,email', 'buyRequest.user.characters', 'messages.user:id,email', 'buyer:id,email'])
            ->where('buyer_id', $user->id)
            ->whereNotNull('buy_request_id')
            ->orderByDesc('updated_at')
            ->get()
            ->map(function ($chat) use ($user) {
                $chat->buyRequest?->resolveServerContacts();
                $char = $user->characters->firstWhere('server', $chat->server);
                $chat->buyer_character_name = $char?->character_name;
                return $chat;
            });
        // 販売希望の順番待ち（買取の open キュー内での自分の順位・待ち人数）を付与
        \App\Models\TradeChat::annotateBuyerQueue($chats, 'buy_request_id');
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

        // listing_id でグループ化して返す（各グループに順番待ち情報を付与・2番目以降は匿名化）
        $grouped = $chats->groupBy('listing_id')
            ->map(fn($group) => \App\Models\TradeChat::annotateOwnerQueue($group->values()));
        return response()->json($grouped);
    });

    // 出品
    Route::post('listings',              [ListingController::class, 'store']);
    Route::put('listings/{id}',          [ListingController::class, 'update']);
    Route::delete('listings/{id}',       [ListingController::class, 'destroy']);
    Route::post('listings/{id}/renew',   [ListingController::class, 'renew']);
    Route::get('listings/{id}/chats',    [ListingController::class, 'chats']);
    Route::post('listings/{id}/chats',   [ListingController::class, 'createChat']);

    // 買取
    Route::post('buy-requests',              [BuyRequestController::class, 'store']);
    Route::put('buy-requests/{id}',          [BuyRequestController::class, 'update']);
    Route::delete('buy-requests/{id}',       [BuyRequestController::class, 'destroy']);
    Route::post('buy-requests/{id}/renew',   [BuyRequestController::class, 'renew']);
    Route::get('buy-requests/{id}/chats',    [BuyRequestController::class, 'chats']);
    Route::post('buy-requests/{id}/chats',   [BuyRequestController::class, 'createChat']);

    // 通知サマリー（5秒ポーリング用）
    Route::get('notifications/summary', [\App\Http\Controllers\NotificationController::class, 'summary']);

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
    Route::put('board/posts/{id}',         [BoardController::class, 'updatePost']);

    // 運営掲示板：管理者のみ（状態変更・削除）
    Route::middleware('role:admin')->group(function () {
        Route::patch('board/threads/{id}/status',     [BoardController::class, 'updateStatus']);
        Route::patch('board/threads/{id}/visibility', [BoardController::class, 'updateVisibility']);
        Route::delete('board/threads/{id}',           [BoardController::class, 'destroyThread']);
        Route::delete('board/posts/{id}',             [BoardController::class, 'destroyPost']);
    });

    // 付加効果の項目名候補の管理（editor / admin）
    Route::middleware('role:editor')->group(function () {
        Route::get('admin/bonus-value-labels',            [BonusValueLabelController::class, 'adminIndex']);
        Route::post('admin/bonus-value-labels',           [BonusValueLabelController::class, 'store']);
        Route::post('admin/bonus-value-labels/reorder',   [BonusValueLabelController::class, 'reorder']);
        Route::put('admin/bonus-value-labels/{id}',       [BonusValueLabelController::class, 'update']);
        Route::delete('admin/bonus-value-labels/{id}',    [BonusValueLabelController::class, 'destroy']);
    });

    // ユーザー管理（admin限定）
    Route::middleware('role:admin')->group(function () {
        Route::get('admin/users',                [AdminController::class, 'users']);
        Route::put('admin/users/{id}/role',      [AdminController::class, 'updateRole']);
        Route::post('admin/users/{id}/suspend',  [AdminController::class, 'suspend']);
        Route::post('admin/users/{id}/unsuspend',[AdminController::class, 'unsuspend']);
        Route::post('admin/users/{id}/verify',   [AdminController::class, 'verifyEmail']);

        // お知らせ管理
        Route::get('admin/announcements',          [AnnouncementController::class, 'adminIndex']);
        Route::post('admin/announcements/reorder', [AnnouncementController::class, 'reorder']);
        Route::post('admin/announcements',         [AnnouncementController::class, 'store']);
        Route::put('admin/announcements/{id}',     [AnnouncementController::class, 'update']);
        Route::delete('admin/announcements/{id}',  [AnnouncementController::class, 'destroy']);
    });
});
