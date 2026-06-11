<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class CharacterController extends Controller
{
    public function index(Request $request)
    {
        return response()->json($request->user()->characters);
    }

    public function upsert(Request $request)
    {
        $data = $request->validate([
            'server'         => 'required|in:Emerald,Diamond,Pearl',
            'character_name' => 'required|string|max:100',
        ]);

        $char = $request->user()->characters()->updateOrCreate(
            ['server' => $data['server']],
            ['character_name' => $data['character_name']]
        );

        return response()->json($char, 201);
    }

    public function destroy(Request $request, int $id)
    {
        $char = $request->user()->characters()->findOrFail($id);
        $char->delete();
        return response()->json(null, 204);
    }

    /**
     * 指定キャラクターのデフォルト設定をトグルする（複数キャラを同時に既定にできる）。
     * is_default = true/false を個別に設定し、他のキャラには影響しない。
     */
    public function setDefault(Request $request)
    {
        $data = $request->validate([
            'character_id' => 'required|integer',
            'is_default'   => 'required|boolean',
        ]);

        $user = $request->user();
        // 本人のキャラであることを確認して設定
        $char = $user->characters()->findOrFail($data['character_id']);
        $char->update(['is_default' => $data['is_default']]);

        return response()->json($user->characters()->get());
    }
}
