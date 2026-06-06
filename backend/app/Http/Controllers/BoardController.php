<?php

namespace App\Http\Controllers;

use App\Models\BoardPost;
use App\Models\BoardThread;
use App\Models\User;
use Illuminate\Http\Request;

class BoardController extends Controller
{
    /**
     * 投稿者の表示名。メールは秘匿されているため、登録キャラクター名を使う。
     * キャラ未登録の場合は「ユーザー#ID」。
     */
    private function authorName(?User $user): string
    {
        if (!$user) {
            return '退会ユーザー';
        }
        $char = $user->relationLoaded('characters')
            ? $user->characters->first()
            : $user->characters()->first();

        return $char?->character_name ?? "ユーザー#{$user->id}";
    }

    private function threadSummary(BoardThread $thread): array
    {
        return [
            'id'             => $thread->id,
            'title'          => $thread->title,
            'status'         => $thread->status,
            'user_id'        => $thread->user_id,
            'author_name'    => $this->authorName($thread->user),
            'post_count'     => $thread->posts_count ?? $thread->posts()->count(),
            'created_at'     => $thread->created_at,
            'last_active_at' => $thread->updated_at,
        ];
    }

    public function index()
    {
        $threads = BoardThread::with('user.characters')
            ->withCount('posts')
            ->orderByDesc('updated_at')
            ->paginate(30);

        $threads->getCollection()->transform(fn ($t) => $this->threadSummary($t));

        return response()->json($threads);
    }

    public function show(int $id)
    {
        $thread = BoardThread::with(['user.characters', 'posts.user.characters'])->findOrFail($id);

        return response()->json([
            'id'          => $thread->id,
            'title'       => $thread->title,
            'status'      => $thread->status,
            'user_id'     => $thread->user_id,
            'author_name' => $this->authorName($thread->user),
            'created_at'  => $thread->created_at,
            'posts'       => $thread->posts->map(fn ($p) => [
                'id'          => $p->id,
                'user_id'     => $p->user_id,
                'author_name' => $this->authorName($p->user),
                'message'     => $p->message,
                'created_at'  => $p->created_at,
            ])->values(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title'   => 'required|string|max:200',
            'message' => 'required|string|max:5000',
        ]);

        $user = $request->user();

        $thread = BoardThread::create([
            'user_id' => $user->id,
            'title'   => $data['title'],
            'status'  => 'open',
        ]);

        $thread->posts()->create([
            'user_id' => $user->id,
            'message' => $data['message'],
        ]);

        $thread->load('user.characters')->loadCount('posts');

        return response()->json($this->threadSummary($thread), 201);
    }

    public function storePost(Request $request, int $id)
    {
        $thread = BoardThread::findOrFail($id);

        $data = $request->validate([
            'message' => 'required|string|max:5000',
        ]);

        $user = $request->user();

        $post = $thread->posts()->create([
            'user_id' => $user->id,
            'message' => $data['message'],
        ]);

        // スレッドの最終更新日時を更新（一覧の並び替え用）
        $thread->touch();

        $post->load('user.characters');

        return response()->json([
            'id'          => $post->id,
            'user_id'     => $post->user_id,
            'author_name' => $this->authorName($post->user),
            'message'     => $post->message,
            'created_at'  => $post->created_at,
        ], 201);
    }

    public function updateStatus(Request $request, int $id)
    {
        $data = $request->validate([
            'status' => 'required|in:open,resolved',
        ]);

        $thread = BoardThread::findOrFail($id);
        $thread->update(['status' => $data['status']]);

        return response()->json(['id' => $thread->id, 'status' => $thread->status]);
    }

    public function destroyThread(int $id)
    {
        BoardThread::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    public function destroyPost(int $id)
    {
        BoardPost::findOrFail($id)->delete();
        return response()->json(null, 204);
    }
}
