<?php

namespace App\Auth;

use App\Support\EmailHasher;
use Illuminate\Auth\EloquentUserProvider;

/**
 * メール列がブラインドインデックス（ハッシュ）で保存されていることを前提に、
 * 認証情報の email をハッシュ化してからユーザーを検索する UserProvider。
 *
 * これにより Auth::attempt(['email' => 平文, 'password' => ...]) や
 * パスワードブローカーのユーザー検索が、平文を保存せずに機能する。
 */
class HashedEmailUserProvider extends EloquentUserProvider
{
    public function retrieveByCredentials(array $credentials)
    {
        if (isset($credentials['email']) && is_string($credentials['email'])) {
            $credentials['email'] = EmailHasher::hash($credentials['email']);
        }

        return parent::retrieveByCredentials($credentials);
    }
}
