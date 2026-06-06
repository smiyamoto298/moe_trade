<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;

class VerifyEmailJapanese extends VerifyEmail
{
    protected function buildMailMessage($url): MailMessage
    {
        return (new MailMessage)
            ->subject('【MoE Trade】メールアドレスの確認')
            ->greeting('こんにちは！')
            ->line('以下のボタンをクリックしてメールアドレスを確認してください。')
            ->action('メールアドレスを確認する', $url)
            ->line('このリンクは60分間有効です。')
            ->line('心当たりがない場合は、このメールを無視してください。')
            ->salutation('MoE Trade');
    }
}
