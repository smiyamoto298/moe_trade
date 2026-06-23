<?php

namespace Tests\Unit;

use App\Support\EmailHasher;
use App\Support\ProdDataMasker;
use Tests\TestCase;

class ProdDataMaskerTest extends TestCase
{
    private function masker(): ProdDataMasker
    {
        // パスワードハッシュは固定値を渡し、bcrypt のコストで遅くならないようにする。
        return new ProdDataMasker('$2y$dummyhash', 'fixed-salt');
    }

    public function test_IPは決定的にマスクされ同じ入力は同じ出力になる(): void
    {
        $m = $this->masker();

        $a = $m->maskIp('203.0.113.45');
        $b = $m->maskIp('203.0.113.45');

        $this->assertSame($a, $b, '同じIPは常に同じ値（判別可能性を保つ）');
        $this->assertStringStartsWith('10.', $a, 'プライベート空間に収める');
        $this->assertStringNotContainsString('203.0.113', $a, '元IPは残さない');
    }

    public function test_異なるIPは異なる値になりやすい(): void
    {
        $m = $this->masker();
        $this->assertNotSame($m->maskIp('203.0.113.45'), $m->maskIp('198.51.100.7'));
    }

    public function test_空やnullのIPはそのまま返す(): void
    {
        $m = $this->masker();
        $this->assertNull($m->maskIp(null));
        $this->assertSame('', $m->maskIp(''));
    }

    public function test_usersはメールとパスワードとIPがマスクされる(): void
    {
        $m = $this->masker();

        $row = $m->maskRow('users', [
            'id' => 7,
            'email' => 'real-blind-index-hash',
            'password' => '$2y$realhash',
            'register_ip' => '203.0.113.45',
            'remember_token' => 'secret-token',
            'role' => 'admin',
        ]);

        // ローカルの EMAIL_HASH_KEY で user7@dev.local をハッシュ化した値になる
        $this->assertSame(EmailHasher::hash('user7@dev.local'), $row['email']);
        $this->assertSame('$2y$dummyhash', $row['password']);
        $this->assertStringStartsWith('10.', $row['register_ip']);
        $this->assertNull($row['remember_token']);
        // 業務上必要な列はそのまま残す
        $this->assertSame('admin', $row['role']);
    }

    public function test_キャラ名とアカウント名はidで一意な判別可能名になる(): void
    {
        $m = $this->masker();

        $char = $m->maskRow('user_characters', ['id' => 3, 'character_name' => '本名キャラ']);
        $this->assertSame('キャラ3', $char['character_name']);

        $acc = $m->maskRow('moe_accounts', ['id' => 9, 'name' => '本番アカウント']);
        $this->assertSame('アカウント9', $acc['name']);
    }

    public function test_取引履歴と取引チャットのIPがマスクされる(): void
    {
        $m = $this->masker();

        $hist = $m->maskRow('trade_history', [
            'id' => 1, 'seller_ip' => '203.0.113.1', 'buyer_ip' => '203.0.113.2',
        ]);
        $this->assertStringStartsWith('10.', $hist['seller_ip']);
        $this->assertStringStartsWith('10.', $hist['buyer_ip']);

        $chat = $m->maskRow('trade_chats', ['id' => 1, 'request_ip' => '203.0.113.3']);
        $this->assertStringStartsWith('10.', $chat['request_ip']);
    }

    public function test_対象外テーブルは変更しない(): void
    {
        $m = $this->masker();
        $row = ['id' => 1, 'name' => 'アイテムA', 'description' => '説明'];
        $this->assertSame($row, $m->maskRow('items', $row));
    }
}
