<?php

namespace Tests\Feature;

use App\Models\BatchRun;
use App\Support\EmailHasher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PullProdDataTest extends TestCase
{
    use RefreshDatabase;

    /** テスト内で追加登録するマイグレーションの置き場所（未デプロイ分の再適用検証用）。 */
    private string $probeMigrationDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->probeMigrationDir = storage_path('framework/testing/pull-prod-probe-migrations');
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->probeMigrationDir);
        parent::tearDown();
    }

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
        config(['database.connections.prod.host' => null, 'database.connections.prod.database' => null]);

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
        config(['database.connections.prod.host' => null, 'database.connections.prod.database' => null]);

        $this->artisan('db:pull-prod')->assertExitCode(1);

        $run = BatchRun::where('command', 'db:pull-prod')->firstOrFail();
        $this->assertSame('failed', $run->status);
        $this->assertStringContainsString('PROD_DB', $run->summary);
    }

    public function test_ローカルと本番のDBドライバが異なる場合は失敗する(): void
    {
        // テストのローカルは sqlite。本番接続を mysql のままにするとスキーマ複製できないため拒否する。
        config(['database.connections.prod.host' => 'prod.example', 'database.connections.prod.database' => 'moe']);

        $this->artisan('db:pull-prod')->assertExitCode(1);

        $run = BatchRun::where('command', 'db:pull-prod')->firstOrFail();
        $this->assertStringContainsString('ドライバが異なる', $run->summary);
    }

    public function test_本番のスキーマごと複製しマスキングされる(): void
    {
        $prod = $this->makeFakeProd();

        $this->artisan('db:pull-prod')->assertExitCode(0);

        // スキーマは本番のものに置き換わる: 本番だけにある列が現れ、ローカルだけの列は消える。
        $this->assertTrue(Schema::hasColumn('users', 'legacy_col'));
        $this->assertFalse(Schema::hasColumn('users', 'email_verified_at'));

        // データはマスキング済み: IP は 10.x.y.z、パスワードは共通 dev パスワード、email は dev 用ハッシュ。
        $user = DB::table('users')->where('id', 1)->first();
        $this->assertStringStartsWith('10.', $user->register_ip);
        $this->assertNotSame('203.0.113.5', $user->register_ip);
        $this->assertTrue(Hash::check('password', $user->password));
        $this->assertSame(EmailHasher::hash('user1@dev.local'), $user->email);
        $this->assertNull($user->remember_token);
        $this->assertSame(2, DB::table('users')->count());

        // migrations テーブルは本番の適用状態ごと複製される（今回は差分なし＝再適用ゼロ）。
        $this->assertSame(
            $prod->table('migrations')->count(),
            DB::table('migrations')->count()
        );

        // 本番に存在しないローカルのテーブルは drop される（適用済み扱いのマイグレーションは再作成しない）。
        $this->assertFalse(Schema::hasTable('items'));

        // ローカル維持テーブルは残り、実行履歴が記録されている。
        $this->assertTrue(Schema::hasTable('batch_runs'));
        $run = BatchRun::where('command', 'db:pull-prod')->firstOrFail();
        $this->assertSame('success', $run->status);
        $this->assertStringContainsString('適用しなおすマイグレーションはありませんでした', $run->summary);
    }

    public function test_本番に未デプロイのマイグレーションは取込後に適用しなおされる(): void
    {
        // ローカルにだけ存在する（＝本番に未デプロイの）マイグレーションを追加登録する。
        // 取込前のデータ件数ではなく「取込後の本番データ」に対して実行されることを
        // users 件数の記録で検証する（データ変換系マイグレーションの再適用に相当）。
        File::ensureDirectoryExists($this->probeMigrationDir);
        File::put(
            $this->probeMigrationDir . '/2099_01_01_000000_create_pull_prod_probe_table.php',
            <<<'PHP'
            <?php

            use Illuminate\Database\Migrations\Migration;
            use Illuminate\Database\Schema\Blueprint;
            use Illuminate\Support\Facades\DB;
            use Illuminate\Support\Facades\Schema;

            return new class extends Migration
            {
                public function up(): void
                {
                    Schema::create('pull_prod_probe', function (Blueprint $table) {
                        $table->id();
                        $table->integer('users_count');
                    });
                    DB::table('pull_prod_probe')->insert(['users_count' => DB::table('users')->count()]);
                }

                public function down(): void
                {
                    Schema::dropIfExists('pull_prod_probe');
                }
            };
            PHP
        );
        $this->app['migrator']->path($this->probeMigrationDir);

        $this->makeFakeProd(); // 本番の migrations にはこのマイグレーションが無い＝未デプロイ

        $this->artisan('db:pull-prod')->assertExitCode(0);

        // 取込後に migrate が走り、未デプロイ分が本番データ（users 2件）に対して適用される。
        $this->assertTrue(Schema::hasTable('pull_prod_probe'));
        $this->assertSame(2, (int) DB::table('pull_prod_probe')->value('users_count'));
        $this->assertTrue(
            DB::table('migrations')->where('migration', '2099_01_01_000000_create_pull_prod_probe_table')->exists()
        );

        $run = BatchRun::where('command', 'db:pull-prod')->firstOrFail();
        $this->assertStringContainsString('1 件適用しなおしました', $run->summary);
        $this->assertStringContainsString('2099_01_01_000000_create_pull_prod_probe_table', $run->summary);
    }

    /**
     * SQLite の別インメモリDBを「本番」として用意する。
     * users（本番固有情報入り・本番だけの legacy_col 列あり）と、
     * ローカルの全マイグレーションを適用済みとする migrations テーブルを持つ。
     */
    private function makeFakeProd(): \Illuminate\Database\Connection
    {
        config(['database.connections.prod' => [
            'driver'                  => 'sqlite',
            'database'                => ':memory:',
            'prefix'                  => '',
            'foreign_key_constraints' => false,
        ]]);
        DB::purge('prod');
        $prod = DB::connection('prod');

        $prod->statement(<<<'SQL'
            create table "users" (
                "id" integer primary key autoincrement,
                "name" varchar not null,
                "email" varchar not null,
                "password" varchar not null,
                "register_ip" varchar,
                "remember_token" varchar,
                "role" varchar not null default 'user',
                "legacy_col" varchar
            )
            SQL);
        $prod->table('users')->insert([
            ['id' => 1, 'name' => '本番ユーザー1', 'email' => 'prod-hash-1', 'password' => 'prod-secret-1', 'register_ip' => '203.0.113.5', 'remember_token' => 'tok1', 'role' => 'admin', 'legacy_col' => 'legacy'],
            ['id' => 2, 'name' => '本番ユーザー2', 'email' => 'prod-hash-2', 'password' => 'prod-secret-2', 'register_ip' => '198.51.100.7', 'remember_token' => 'tok2', 'role' => 'user', 'legacy_col' => null],
        ]);

        $prod->statement('create table "migrations" ("id" integer primary key autoincrement, "migration" varchar not null, "batch" integer not null)');
        foreach (DB::table('migrations')->orderBy('id')->get() as $m) {
            $prod->table('migrations')->insert(['migration' => $m->migration, 'batch' => $m->batch]);
        }

        return $prod;
    }
}
