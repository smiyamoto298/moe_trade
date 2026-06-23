<?php

namespace Tests\Feature;

use App\Models\BatchRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PullProdDataTest extends TestCase
{
    use RefreshDatabase;

    public function test_取込APIは未ログイン_一般_editorを拒否する(): void
    {
        $this->postJson('/api/admin/dev/pull-prod')->assertStatus(401);
        $this->actingAs($this->makeUser(), 'sanctum')
            ->postJson('/api/admin/dev/pull-prod')->assertStatus(403);
        $this->actingAs($this->makeUserWithRole('editor'), 'sanctum')
            ->postJson('/api/admin/dev/pull-prod')->assertStatus(403);
    }

    public function test_本番DB未設定なら失敗を返し履歴に記録される(): void
    {
        // テスト環境では PROD_DB_* が未設定なので、コマンドは設定エラーで失敗する。
        config(['database.connections.prod.host' => null]);

        $res = $this->actingAs($this->makeUserWithRole('admin'), 'sanctum')
            ->postJson('/api/admin/dev/pull-prod');

        $res->assertStatus(500)
            ->assertJsonPath('ok', false)
            ->assertJsonPath('run.status', 'failed');
        $this->assertStringContainsString('PROD_DB', $res->json('run.summary'));

        $run = BatchRun::where('command', 'db:pull-prod')->firstOrFail();
        $this->assertSame('failed', $run->status);
    }

    public function test_コマンドは本番DB未設定で例外メッセージを記録する(): void
    {
        config(['database.connections.prod.host' => null]);

        $this->artisan('db:pull-prod')->assertExitCode(1);

        $run = BatchRun::where('command', 'db:pull-prod')->firstOrFail();
        $this->assertSame('failed', $run->status);
        $this->assertStringContainsString('PROD_DB', $run->summary);
    }
}
