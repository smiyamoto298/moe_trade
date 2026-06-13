<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnnouncementController extends Controller
{
    /** 公開用: 表示中のお知らせ一覧（sort_order 昇順 → 新しい順）。期限切れは除外。 */
    public function index()
    {
        $items = Announcement::where('is_active', true)
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->orderBy('sort_order')
            ->orderByDesc('id')
            ->get();

        return response()->json($items);
    }

    /** 管理用: 全お知らせ一覧（パネル表示順 = sort_order 昇順）。 */
    public function adminIndex()
    {
        $items = Announcement::orderBy('sort_order')->orderBy('id')->get();
        return response()->json($items);
    }

    public function store(Request $request)
    {
        $data = $this->validateData($request);
        // 新規は末尾に追加（パネル表示順の最後）。
        $data['sort_order'] = (int) (Announcement::max('sort_order') ?? -1) + 1;

        $announcement = new Announcement($data);
        $announcement->save();
        $announcement->syncExpiresAt();
        $announcement->save();

        return response()->json($announcement->fresh(), 201);
    }

    public function update(Request $request, int $id)
    {
        $announcement = Announcement::findOrFail($id);
        $announcement->fill($this->validateData($request));
        $announcement->syncExpiresAt();
        $announcement->save();

        return response()->json($announcement->fresh());
    }

    public function destroy(int $id)
    {
        Announcement::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    /** パネルの並び替え: 受け取った id の順序で sort_order を 0,1,2... に振り直す。 */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids'   => 'required|array',
            'ids.*' => 'integer|exists:announcements,id',
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['ids'] as $order => $id) {
                Announcement::where('id', $id)->update(['sort_order' => $order]);
            }
        });

        return response()->json(null, 204);
    }

    private function validateData(Request $request): array
    {
        return $request->validate([
            'message'      => 'required|string|max:2000',
            'level'        => 'nullable|in:info,warning,error',
            'link_url'     => 'nullable|url|max:500',
            'link_label'   => 'nullable|string|max:100',
            'link_new_tab' => 'nullable|boolean',
            'is_active'    => 'nullable|boolean',
            // 表示期間（日数）。null/未指定 = 無期限。
            'display_days' => 'nullable|integer|min:1|max:3650',
        ]);
    }
}
