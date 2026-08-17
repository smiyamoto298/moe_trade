<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * 取引イベントのメール通知。
 *
 * Web Push と同じ文面（タイトル・本文・遷移先）をメールでも届ける。
 * 宛先は User::$plainEmail 経由（App\Support\Notifier が通知先メールをセットする）。
 * 件名・本文には相手のキャラクター名などサイト上の公開情報しか含めず、
 * メールアドレス等の個人情報は載せない。
 */
class TradeEventMail extends Notification
{
    public function __construct(
        private string $title,
        private string $body,
        private string $url = '/mypage',
    ) {
    }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontend = rtrim(config('app.frontend_url'), '/');

        return (new MailMessage)
            ->subject($this->title)
            ->greeting('MoE Trade からのお知らせ')
            ->line($this->body)
            ->action('サイトで確認する', $frontend . $this->url)
            ->line('通知の種類ごとの受け取り設定・通知先メールアドレスの変更・配信停止は、マイページの「通知設定」から行えます。')
            ->salutation('MoE Trade');
    }
}
