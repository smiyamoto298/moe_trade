<?php

use App\Http\Controllers\SitemapController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn() => response()->json(['status' => 'ok']));

// 検索エンジン向けサイトマップ（robots.txt から参照）
Route::get('/sitemap.xml', SitemapController::class);
