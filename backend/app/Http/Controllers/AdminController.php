<?php

namespace App\Http\Controllers;

use App\Models\BatchRun;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

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

    // バッチ（Artisanコマンド）の実行履歴。新しい順に直近分を返す。
    // command クエリで特定コマンドだけに絞り込める。
    public function batchRuns(Request $request)
    {
        $data = $request->validate([
            'command' => 'nullable|string|max:100',
        ]);

        $runs = BatchRun::query()
            ->when($data['command'] ?? null, fn($q, $command) => $q->where('command', $command))
            ->orderByDesc('started_at')
            ->limit(200)
            ->get();

        // 過去に1度でも実行されたコマンド名（フィルタ用の選択肢）
        $commands = BatchRun::query()->distinct()->orderBy('command')->pluck('command');

        return response()->json([
            'runs'     => $runs,
            'commands' => $commands,
        ]);
    }

    /**
     * 本番データをマスキングしてローカルDBへ取り込む（db:pull-prod を実行）。
     *
     * ローカルDBを破壊的に上書きするため **ローカル環境専用**。本番では 403 を返す。
     * 実行結果（要約・件数・ローカルログイン情報）は batch_runs に記録され、
     * その最新行をレスポンスで返す。
     */
    public function pullProdData()
    {
        if (app()->environment('production')) {
            abort(403, '本番環境では実行できません。');
        }

        $exit = Artisan::call('db:pull-prod');
        $run  = BatchRun::where('command', 'db:pull-prod')->orderByDesc('started_at')->first();

        return response()->json([
            'ok'  => $exit === 0,
            'run' => $run,
        ], $exit === 0 ? 200 : 500);
    }
}
