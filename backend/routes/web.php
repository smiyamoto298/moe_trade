<?php

use App\Http\Controllers\ItemPageController;
use App\Http\Controllers\SitemapController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn() => response()->json(['status' => 'ok']));

// 検索エンジン向けサイトマップ（robots.txt から参照）
Route::get('/sitemap.xml', SitemapController::class);

// アイテム恒久ページはサーバ側でメタ注入して返す（SPA シェルのままだとクローラーが
// アイテムを区別できずインデックスされないため。数値IDのみ。本番 .htaccess が振り分ける）
Route::get('/items/{id}', ItemPageController::class)->whereNumber('id');
