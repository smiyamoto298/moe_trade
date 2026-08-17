<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

/**
 * 通知先メールアドレスの確認メール。
 *
 * ログイン用アドレスとは別のアドレスを通知先に指定したときだけ送る。
 * リンク（60分有効の署名付きURL）を踏むまで、そのアドレスへは一切通知を送らない
 * （第三者のアドレスを登録しての嫌がらせ送信・ドメイン評価低下を防ぐため）。
 *
 * URL には user_id と「そのアドレスのハッシュ」だけを載せ、アドレス自体は載せない。
 * 確認後にアドレスが変更されると hash が変わり、古いリンクは自動的に無効になる。
 */
class VerifyNotificationEmail extends Notification
{
    public function __construct(private string $email)
    {
    }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = URL::temporarySignedRoute(
            'notification-email.verify',
            now()->addMinutes(60),
            ['id' => $notifiable->getKey(), 'hash' => sha1($this->email)]
        );

        return (new MailMessage)
            ->subject('【MoE Trade】通知先メールアドレスの確認')
            ->greeting('こんにちは！')
            ->line('MoE Trade の通知先メールアドレスとして、このアドレスが指定されました。')
            ->line('以下のボタンをクリックして確認を完了してください。確認が完了するまで、このアドレスへ通知は届きません。')
            ->action('通知先メールアドレスを確認する', $url)
            ->line('このリンクは60分間有効です。')
            ->line('心当たりがない場合は、このメールを無視してください（無視すれば通知は届きません）。')
            ->salutation('MoE Trade');
    }
}
