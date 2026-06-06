<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;

class ResetPasswordJapanese extends ResetPassword
{
    /**
     * リセットメールを構築。リンクはフロントエンドのリセット画面を指す。
     */
    public function toMail($notifiable): MailMessage
    {
        $frontend = rtrim(config('app.frontend_url'), '/');

        // getEmailForPasswordReset() はハッシュ値を返すため、再設定フォームへは
        // 送信時の平文メール（plainEmail）を渡す。フォームからPOSTされた平文を
        // 再度ハッシュ化してユーザーを照合する。
        $emailForLink = $notifiable->plainEmail ?? $notifiable->getEmailForPasswordReset();

        $url = $frontend . '/auth/reset-password?token=' . $this->token
            . '&email=' . urlencode($emailForLink);

        $expire = config('auth.passwords.' . config('auth.defaults.passwords') . '.expire', 60);

        return (new MailMessage)
            ->subject('【MoE Trade】パスワード再設定のご案内')
            ->greeting('こんにちは！')
            ->line('パスワード再設定のリクエストを受け付けました。以下のボタンから新しいパスワードを設定してください。')
            ->action('パスワードを再設定する', $url)
            ->line("このリンクは {$expire} 分間有効です。")
            ->line('心当たりがない場合は、このメールを無視してください。パスワードは変更されません。')
            ->salutation('MoE Trade');
    }
}
