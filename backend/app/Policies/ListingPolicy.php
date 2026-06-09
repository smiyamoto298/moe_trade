<?php

namespace App\Policies;

use App\Models\Listing;
use App\Models\User;

/**
 * 出品の認可ポリシー。
 *
 * ListingController@update は $this->authorize('update', $listing) を呼ぶが、
 * ポリシーが存在しないと全リクエストが拒否される（Gateのデフォルト挙動）ため、
 * 本人またはadminのみ許可するポリシーを定義する。
 * （App\Models\Listing → App\Policies\ListingPolicy の命名規約で自動検出される）
 */
class ListingPolicy
{
    public function update(User $user, Listing $listing): bool
    {
        return $listing->user_id === $user->id || $user->isAdmin();
    }
}
