<?php

namespace App\Policies;

use App\Models\BuyRequest;
use App\Models\User;

/**
 * 買取の認可ポリシー。本人または admin のみ更新可。
 * （App\Models\BuyRequest → App\Policies\BuyRequestPolicy の命名規約で自動検出される）
 */
class BuyRequestPolicy
{
    public function update(User $user, BuyRequest $buyRequest): bool
    {
        return $buyRequest->user_id === $user->id || $user->isAdmin();
    }
}
