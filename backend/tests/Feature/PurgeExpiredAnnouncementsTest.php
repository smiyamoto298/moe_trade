<?php

namespace Tests\Feature;

use App\Models\Announcement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PurgeExpiredAnnouncementsTest extends TestCase
{
    use RefreshDatabase;

    public function test_表示期限切れのお知らせだけを削除する(): void
    {
        // 期限切れ（過去）
        $expired = Announcement::create([
            'message'    => '期限切れ',
            'expires_at' => now()->subDay(),
        ]);

        // 期限内（未来）
        $valid = Announcement::create([
            'message'    => '期限内',
            'expires_at' => now()->addDay(),
        ]);

        // 無期限（expires_at = null）
        $permanent = Announcement::create([
            'message'    => '無期限',
            'expires_at' => null,
        ]);

        $this->artisan('announcements:purge-expired')
            ->expectsOutputToContain('1 件削除')
            ->assertExitCode(0);

        $this->assertDatabaseMissing('announcements', ['id' => $expired->id]);
        $this->assertDatabaseHas('announcements', ['id' => $valid->id]);
        $this->assertDatabaseHas('announcements', ['id' => $permanent->id]);
    }

    public function test_削除対象がなくても正常終了する(): void
    {
        $permanent = Announcement::create([
            'message'    => '無期限',
            'expires_at' => null,
        ]);

        $this->artisan('announcements:purge-expired')
            ->expectsOutputToContain('0 件削除')
            ->assertExitCode(0);

        $this->assertDatabaseHas('announcements', ['id' => $permanent->id]);
    }
}
