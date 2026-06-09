<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class AdminController extends Controller
{
    public function users(Request $request)
    {
        $query = User::query()
            ->when($request->email, fn($q) => $q->where('email', 'like', "%{$request->email}%"))
            ->when($request->role, fn($q) => $q->where('role', $request->role))
            ->when($request->is_suspended !== null, fn($q) => $q->where('is_suspended', (bool)$request->is_suspended));

        // 管理画面はクライアント側で検索・同一IP検出を行うため全件返却
        return response()->json($query->with('characters')->orderByDesc('created_at')->get());
    }

    public function updateRole(Request $request, int $id)
    {
        $data = $request->validate(['role' => 'required|in:user,editor,admin']);
        $user = User::findOrFail($id);
        $user->update($data);
        return response()->json($user->load('characters'));
    }

    public function suspend(int $id)
    {
        $user = User::findOrFail($id);
        $user->update(['is_suspended' => true]);
        return response()->json($user->load('characters'));
    }

    public function unsuspend(int $id)
    {
        $user = User::findOrFail($id);
        $user->update(['is_suspended' => false]);
        return response()->json($user->load('characters'));
    }

    // メール送信失敗等で認証できないユーザーを手動で認証済みにする
    public function verifyEmail(int $id)
    {
        $user = User::findOrFail($id);
        if (!$user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }
        return response()->json($user->load('characters'));
    }
}
