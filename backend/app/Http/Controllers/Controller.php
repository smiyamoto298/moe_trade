<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

abstract class Controller
{
    // $this->authorize() を使えるようにする（ListingController@update 等）
    use AuthorizesRequests;
}
