<?php

namespace App\Http\Controllers;

use App\Models\BoardPost;
use App\Models\BoardThread;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BoardController extends Controller
{
    /**
     * アップロードされた画像を public ディスクへ保存し、相対パスを返す。
     * 画像がなければ null。
     */
    private function storeImage(Request $request): ?string
    {
        if (!$request->hasFile('image')) {
            return null;
        }

        return $request->file('image')->store('board', 'public');
    }

    /**
     * 投稿1件のJSON表現。
     */
    private function postPayload(BoardPost $post): array
    {
        return [
            'id'          => $post->id,
            'user_id'     => $post->user_id,
            'author_name' => $this->authorName($post->user),
            'message'     => $post->message,
            'image_url'   => $post->imageUrl(),
            'created_at'  => $post->created_at,
            'updated_at'  => $post->updated_at,
        ];
    }

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
            'admin_only'     => (bool) $thread->admin_only,
            'user_id'        => $thread->user_id,
            'author_name'    => $this->authorName($thread->user),
            'post_count'     => $thread->posts_count ?? $thread->posts()->count(),
            'created_at'     => $thread->created_at,
            'last_active_at' => $thread->updated_at,
        ];
    }

    public function index(Request $request)
    {
        $threads = BoardThread::with('user.characters')
            ->withCount('posts')
            // 管理者限定スレッドは管理者以外には表示しない
            ->when(!$request->user()->isAdmin(), fn ($q) => $q->where('admin_only', false))
            // 対応中（open）を先に表示し、各グループ内は最終更新が新しい順
            ->orderByRaw("status = 'resolved' ASC")
            ->orderByDesc('updated_at')
            ->paginate(30);

        $threads->getCollection()->transform(fn ($t) => $this->threadSummary($t));

        return response()->json($threads);
    }

    public function show(Request $request, int $id)
    {
        $thread = BoardThread::with(['user.characters', 'posts.user.characters'])->findOrFail($id);

        // 管理者限定スレッドは管理者以外閲覧不可
        if ($thread->admin_only && !$request->user()->isAdmin()) {
            abort(403, 'このスレッドは管理者のみ閲覧できます。');
        }

        return response()->json([
            'id'          => $thread->id,
            'title'       => $thread->title,
            'status'      => $thread->status,
            'admin_only'  => (bool) $thread->admin_only,
            'user_id'     => $thread->user_id,
            'author_name' => $this->authorName($thread->user),
            'created_at'  => $thread->created_at,
            'posts'       => $thread->posts->map(fn ($p) => $this->postPayload($p))->values(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title'      => 'required|string|max:200',
            'message'    => 'required|string|max:5000',
            'image'      => 'nullable|image|mimes:jpeg,png,gif,webp|max:5120',
            'admin_only' => 'nullable|boolean',
        ]);

        $user = $request->user();

        $thread = BoardThread::create([
            'user_id'    => $user->id,
            'title'      => $data['title'],
            'status'     => 'open',
            // 管理者限定スレッドは管理者のみ作成可能
            'admin_only' => $user->isAdmin() ? $request->boolean('admin_only') : false,
        ]);

        $thread->posts()->create([
            'user_id'    => $user->id,
            'message'    => $data['message'],
            'image_path' => $this->storeImage($request),
        ]);

        $thread->load('user.characters')->loadCount('posts');

        return response()->json($this->threadSummary($thread), 201);
    }

    public function storePost(Request $request, int $id)
    {
        $thread = BoardThread::findOrFail($id);

        // 管理者限定スレッドには管理者以外投稿できない
        if ($thread->admin_only && !$request->user()->isAdmin()) {
            abort(403, 'このスレッドは管理者のみ投稿できます。');
        }

        $data = $request->validate([
            'message' => 'nullable|string|max:5000|required_without:image',
            'image'   => 'nullable|image|mimes:jpeg,png,gif,webp|max:5120|required_without:message',
        ]);

        $user = $request->user();

        $post = $thread->posts()->create([
            'user_id'    => $user->id,
            'message'    => $data['message'] ?? '',
            'image_path' => $this->storeImage($request),
        ]);

        // スレッドの最終更新日時を更新（一覧の並び替え用）
        $thread->touch();

        $post->load('user.characters');

        return response()->json($this->postPayload($post), 201);
    }

    /**
     * 投稿の編集。本人のみ可能。
     */
    public function updatePost(Request $request, int $id)
    {
        $post = BoardPost::findOrFail($id);

        if ($post->user_id !== $request->user()->id) {
            abort(403, '自分の投稿のみ編集できます。');
        }

        $data = $request->validate([
            'message'      => 'nullable|string|max:5000',
            'image'        => 'nullable|image|mimes:jpeg,png,gif,webp|max:5120',
            'remove_image' => 'nullable|boolean',
        ]);

        $newImage   = $request->hasFile('image');
        $removeFlag = $request->boolean('remove_image');
        // 編集後に画像が残るか（既存を保持 or 新規アップロード）
        $keepsImage = $newImage || ($post->image_path && !$removeFlag);
        $message    = $data['message'] ?? '';

        if ($message === '' && !$keepsImage) {
            abort(422, '本文または画像のいずれかが必要です。');
        }

        $updates = ['message' => $message];

        if ($newImage) {
            // 旧画像を差し替え
            if ($post->image_path) {
                Storage::disk('public')->delete($post->image_path);
            }
            $updates['image_path'] = $this->storeImage($request);
        } elseif ($removeFlag && $post->image_path) {
            Storage::disk('public')->delete($post->image_path);
            $updates['image_path'] = null;
        }

        $post->update($updates);
        $post->load('user.characters');

        return response()->json($this->postPayload($post));
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

    /**
     * スレッドの公開範囲を変更（管理者のみ）。
     * admin_only = true で管理者限定、false で全員に公開。
     */
    public function updateVisibility(Request $request, int $id)
    {
        $data = $request->validate([
            'admin_only' => 'required|boolean',
        ]);

        $thread = BoardThread::findOrFail($id);
        $thread->update(['admin_only' => $data['admin_only']]);

        return response()->json(['id' => $thread->id, 'admin_only' => (bool) $thread->admin_only]);
    }

    public function destroyThread(int $id)
    {
        $thread = BoardThread::with('posts')->findOrFail($id);

        // 添付画像ファイルを先に削除（DBはカスケード削除）
        foreach ($thread->posts as $post) {
            if ($post->image_path) {
                Storage::disk('public')->delete($post->image_path);
            }
        }

        $thread->delete();
        return response()->json(null, 204);
    }

    public function destroyPost(int $id)
    {
        $post = BoardPost::findOrFail($id);

        if ($post->image_path) {
            Storage::disk('public')->delete($post->image_path);
        }

        $post->delete();
        return response()->json(null, 204);
    }
}
