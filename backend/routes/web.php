<?php

use App\Http\Controllers\BuyRequestPageController;
use App\Http\Controllers\ItemPageController;
use App\Http\Controllers\ListingPageController;
use App\Http\Controllers\SitemapController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn() => response()->json(['status' => 'ok']));

// 検索エンジン向けサイトマップ（robots.txt から参照）
Route::get('/sitemap.xml', SitemapController::class);

// アイテム恒久ページ・出品/買取詳細はサーバ側でメタ注入して返す（SPA シェルのままだと
// クローラーがページを区別できず「重複」「ソフト404」になるため。数値IDのみ。
// 本番 .htaccess が振り分ける）
Route::get('/items/{id}', ItemPageController::class)->whereNumber('id');
Route::get('/listings/{id}', ListingPageController::class)->whereNumber('id');
Route::get('/buy-requests/{id}', BuyRequestPageController::class)->whereNumber('id');
