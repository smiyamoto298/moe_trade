<?php

namespace Tests\Feature;

use App\Console\Commands\BatchCommand;
use App\Models\Announcement;
use App\Models\BatchRun;
use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 例外を投げるだけのテスト用バッチ。failed 記録の検証に使う。
 */
class FailingBatchCommand extends BatchCommand
{
    protected $signature   = 'test:failing-batch';
    protected $description = 'テスト用（必ず失敗するバッチ）';

    protected function runBatch(): string
    {
        throw new \RuntimeException('わざと失敗');
    }
}

class BatchRunTest extends TestCase
{
    use RefreshDatabase;

    public function test_正常終了したバッチが実行履歴に記録される(): void
    {
        Announcement::create(['message' => '期限切れ', 'expires_at' => now()->subDay()]);

        $this->artisan('announcements:purge-expired')
            ->expectsOutputToContain('1 件削除')
            ->assertExitCode(0);

        $run = BatchRun::firstOrFail();
        $this->assertSame('announcements:purge-expired', $run->command);
        $this->assertSame('success', $run->status);
        $this->assertStringContainsString('1 件削除', $run->summary);
        $this->assertNotNull($run->started_at);
        $this->assertNotNull($run->finished_at);
        $this->assertNotNull($run->duration_ms);
    }

    public function test_例外を投げたバッチはfailedとして記録され非0で終了する(): void
    {
        $this->app[ConsoleKernel::class]->registerCommand(new FailingBatchCommand());

        $this->artisan('test:failing-batch')->assertExitCode(1);

        $run = BatchRun::firstOrFail();
        $this->assertSame('test:failing-batch', $run->command);
        $this->assertSame('failed', $run->status);
        $this->assertStringContainsString('わざと失敗', $run->summary);
        $this->assertNotNull($run->finished_at);
    }

    public function test_実行履歴APIは未ログイン_一般_editorを拒否する(): void
    {
        $this->getJson('/api/admin/batch-runs')->assertStatus(401);
        $this->actingAs($this->makeUser(), 'sanctum')
            ->getJson('/api/admin/batch-runs')->assertStatus(403);
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->getJson('/api/admin/batch-runs')->assertStatus(403);
    }

    public function test_adminは実行履歴を新しい順に取得できる(): void
    {
        $old = BatchRun::create([
            'command' => 'listings:expire', 'status' => 'success',
            'summary' => '古い実行', 'started_at' => now()->subHours(2),
            'finished_at' => now()->subHours(2), 'duration_ms' => 10,
        ]);
        $new = BatchRun::create([
            'command' => 'announcements:purge-expired', 'status' => 'failed',
            'summary' => '新しい実行', 'started_at' => now(),
            'finished_at' => now(), 'duration_ms' => 20,
        ]);

        $res = $this->actingAs($this->makeUserWithRole('admin'), 'sanctum')
            ->getJson('/api/admin/batch-runs');

        $res->assertOk()
            ->assertJsonPath('runs.0.id', $new->id)
            ->assertJsonPath('runs.1.id', $old->id)
            ->assertJsonPath('runs.0.status', 'failed');

        // フィルタ用のコマンド名一覧（ユニーク）
        $this->assertEqualsCanonicalizing(
            ['announcements:purge-expired', 'listings:expire'],
            $res->json('commands'),
        );
    }

    public function test_command指定で特定バッチに絞り込める(): void
    {
        BatchRun::create([
            'command' => 'listings:expire', 'status' => 'success',
            'started_at' => now(), 'finished_at' => now(), 'duration_ms' => 5,
        ]);
        BatchRun::create([
            'command' => 'announcements:purge-expired', 'status' => 'success',
            'started_at' => now(), 'finished_at' => now(), 'duration_ms' => 5,
        ]);

        $res = $this->actingAs($this->makeUserWithRole('admin'), 'sanctum')
            ->getJson('/api/admin/batch-runs?command=listings:expire');

        $res->assertOk()->assertJsonCount(1, 'runs')
            ->assertJsonPath('runs.0.command', 'listings:expire');
    }
}
