<?php

namespace Tests\Unit;

use App\Models\BuyRequest;
use App\Models\Listing;
use App\Support\TradeFreshness;
use Tests\TestCase;

class TradeFreshnessTest extends TestCase
{
    private function fixed(int $price = 1000): Listing
    {
        return new Listing(['price' => $price, 'trade_type' => 'fixed']);
    }

    public function test_値下げは新着扱い(): void
    {
        $this->assertTrue(TradeFreshness::isAttractiveChange($this->fixed(1000), ['price' => 999]));
    }

    public function test_据え置きと値上げは新着扱いにしない(): void
    {
        $this->assertFalse(TradeFreshness::isAttractiveChange($this->fixed(1000), ['price' => 1000]));
        $this->assertFalse(TradeFreshness::isAttractiveChange($this->fixed(1000), ['price' => 1001]));
    }

    public function test_即決から交渉可は新着扱い(): void
    {
        $this->assertTrue(TradeFreshness::isAttractiveChange($this->fixed(1000), ['trade_type' => 'negotiable']));
    }

    public function test_交渉可から即決は新着扱いにしない(): void
    {
        $negotiable = new BuyRequest(['price' => 1000, 'trade_type' => 'negotiable']);
        $this->assertFalse(TradeFreshness::isAttractiveChange($negotiable, ['trade_type' => 'fixed']));
    }

    public function test_即決のまま据え置きは新着扱いにしない(): void
    {
        // trade_type を同値で渡しても、価格据え置きなら対象外
        $this->assertFalse(TradeFreshness::isAttractiveChange($this->fixed(1000), ['trade_type' => 'fixed', 'price' => 1000]));
    }

    public function test_変更指定なしは新着扱いにしない(): void
    {
        $this->assertFalse(TradeFreshness::isAttractiveChange($this->fixed(1000), []));
    }
}
