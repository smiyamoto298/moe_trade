<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    /** 公開用: 表示中のお知らせ一覧（sort_order 昇順 → 新しい順）。 */
    public function index()
    {
        $items = Announcement::where('is_active', true)
            ->orderBy('sort_order')
            ->orderByDesc('id')
            ->get();

        return response()->json($items);
    }

    /** 管理用: 全お知らせ一覧。 */
    public function adminIndex()
    {
        $items = Announcement::orderBy('sort_order')->orderByDesc('id')->get();
        return response()->json($items);
    }

    public function store(Request $request)
    {
        $data = $this->validateData($request);
        $announcement = Announcement::create($data);
        return response()->json($announcement, 201);
    }

    public function update(Request $request, int $id)
    {
        $announcement = Announcement::findOrFail($id);
        $announcement->update($this->validateData($request));
        return response()->json($announcement->fresh());
    }

    public function destroy(int $id)
    {
        Announcement::findOrFail($id)->delete();
        return response()->json(null, 204);
    }

    private function validateData(Request $request): array
    {
        return $request->validate([
            'message'    => 'required|string|max:2000',
            'level'      => 'nullable|in:info,warning,error',
            'link_url'   => 'nullable|url|max:500',
            'link_label' => 'nullable|string|max:100',
            'is_active'  => 'nullable|boolean',
            'sort_order' => 'nullable|integer',
        ]);
    }
}
