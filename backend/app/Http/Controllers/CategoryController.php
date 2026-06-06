<?php

namespace App\Http\Controllers;

use App\Models\ItemCategory;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index()
    {
        $roots = ItemCategory::whereNull('parent_id')
            ->orderBy('sort_order')
            ->with('children')
            ->get();

        return response()->json($roots);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'parent_id'  => 'nullable|exists:item_categories,id',
            'name'       => 'required|string|max:100',
            'sort_order' => 'nullable|integer',
        ]);

        $category = ItemCategory::create($data);
        return response()->json($category, 201);
    }
}
