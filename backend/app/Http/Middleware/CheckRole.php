<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckRole
{
    public function handle(Request $request, Closure $next, string $role): mixed
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => '認証が必要です。'], 401);
        }

        $hierarchy = ['user' => 0, 'editor' => 1, 'admin' => 2];
        $required  = $hierarchy[$role] ?? 0;
        $userLevel = $hierarchy[$user->role] ?? 0;

        if ($userLevel < $required) {
            return response()->json(['message' => '権限がありません。'], 403);
        }

        return $next($request);
    }
}
