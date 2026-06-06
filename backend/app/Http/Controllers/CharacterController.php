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
}
