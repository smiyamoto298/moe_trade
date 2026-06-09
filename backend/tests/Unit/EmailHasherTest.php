<?php

namespace Tests\Unit;

use App\Support\EmailHasher;
use Tests\TestCase;

class EmailHasherTest extends TestCase
{
    public function test_同じメールは同じハッシュになる_決定的(): void
    {
        $this->assertSame(
            EmailHasher::hash('taro@example.com'),
            EmailHasher::hash('taro@example.com')
        );
    }

    public function test_大文字小文字と前後空白は正規化される(): void
    {
        $this->assertSame(
            EmailHasher::hash('taro@example.com'),
            EmailHasher::hash('  TARO@Example.COM ')
        );
    }

    public function test_異なるメールは異なるハッシュになる(): void
    {
        $this->assertNotSame(
            EmailHasher::hash('taro@example.com'),
            EmailHasher::hash('jiro@example.com')
        );
    }

    public function test_ハッシュに平文が含まれない(): void
    {
        $hash = EmailHasher::hash('taro@example.com');

        $this->assertStringNotContainsString('taro', $hash);
        $this->assertStringNotContainsString('@', $hash);
        $this->assertSame(64, strlen($hash)); // SHA-256 hex
    }
}
