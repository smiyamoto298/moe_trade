<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserCharacter;
use App\Support\EmailHasher;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password as PasswordBroker;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $data = $request->validate([
            'email'             => 'required|email',
            'password'          => ['required', 'confirmed', Password::min(8)],
            'characters'        => 'nullable|array',
            'characters.*.server'         => 'required|in:Emerald,Diamond,Pearl',
            'characters.*.character_name' => 'required|string|max:100',
            'characters.*.is_default'     => 'nullable|boolean',
        ]);

        // メールはハッシュ（ブラインドインデックス）で保存・照合する。
        // unique:users,email は平文比較になり機能しないため、ハッシュで重複チェックする。
        $emailHash = EmailHasher::hash($data['email']);
        if (User::where('email', $emailHash)->exists()) {
            throw ValidationException::withMessages([
                'email' => ['このメールアドレスは既に登録されています。'],
            ]);
        }

        $ip = $request->ip();

        $user = User::create([
            'email'       => $emailHash,
            'password'    => $data['password'],
            'register_ip' => $ip,
        ]);

        // 認証メールの送信に使う平文を一時保持（DBには保存されない）。
        $user->plainEmail = $data['email'];

        // 同一IPからの複数アカウント作成を検知して自動停止（本番環境のみ）
        if (app()->isProduction()) {
            $existingCount = User::where('register_ip', $ip)->where('id', '!=', $user->id)->count();
            if ($existingCount > 0) {
                User::where('register_ip', $ip)->update(['is_suspended' => true]);
            }
        }

        // キャラクター初期登録
        if (!empty($data['characters'])) {
            foreach ($data['characters'] as $char) {
                UserCharacter::updateOrCreate(
                    ['user_id' => $user->id, 'server' => $char['server']],
                    ['character_name' => $char['character_name'], 'is_default' => $char['is_default'] ?? false]
                );
            }
        }

        event(new Registered($user));

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => $user->load('characters'),
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        if (!Auth::attempt($data)) {
            return response()->json(['message' => 'メールアドレスまたはパスワードが正しくありません。'], 401);
        }

        $user = Auth::user()->load('characters');
        $token = $user->createToken('api')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'ログアウトしました。']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user()->load('characters'));
    }

    /**
     * 認証メールの再送。
     *
     * 平文メールはDBに保存していないため、宛先として再入力（POST）してもらい、
     * 登録時のハッシュと一致することを確認したうえで送信する。
     */
    public function resendVerification(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
        ]);

        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => '既にメール認証済みです。'], 400);
        }

        if (!hash_equals($user->email, EmailHasher::hash($data['email']))) {
            return response()->json(['message' => 'メールアドレスが登録情報と一致しません。'], 422);
        }

        // 送信時のみ平文を使用（DBには保存しない）。
        $user->plainEmail = $data['email'];
        $user->sendEmailVerificationNotification();

        return response()->json(['message' => '認証メールを再送信しました。']);
    }

    /**
     * パスワード再設定メールの送信。
     * メールアドレスの存在有無に関わらず同一メッセージを返す（アカウント列挙の防止）。
     */
    public function forgotPassword(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
        ]);

        // アカウント列挙を防ぐため、結果に関わらず常に同一メッセージを返す。
        $genericMessage = 'パスワード再設定用のメールを送信しました。メールが届かない場合は、入力したアドレスをご確認ください。';

        // ハッシュでユーザーを検索（標準ブローカーの sendResetLink は
        // 通知の宛先に平文が必要だが、DBには平文が無いため自前で送信する）。
        $user = User::where('email', EmailHasher::hash($data['email']))->first();

        if ($user) {
            $repository = PasswordBroker::broker()->getRepository();

            // スロットリング中は送信をスキップ（存在を漏らさないため応答は同一）。
            if (!$repository->recentlyCreatedToken($user)) {
                $token = $repository->create($user);

                // 送信時のみ平文を宛先に使用（DBには保存しない）。
                $user->plainEmail = $data['email'];
                $user->sendPasswordResetNotification($token);
            }
        }

        return response()->json(['message' => $genericMessage]);
    }

    /**
     * トークンを用いたパスワードの再設定。
     */
    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'token'    => 'required|string',
            'email'    => 'required|email',
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        // ハッシュでユーザーを検索し、トークンの正当性を確認する。
        $user = User::where('email', EmailHasher::hash($data['email']))->first();
        $repository = PasswordBroker::broker()->getRepository();

        if (!$user || !$repository->exists($user, $data['token'])) {
            return response()->json([
                'message' => 'リンクの有効期限が切れているか、無効です。お手数ですが再度お試しください。',
            ], 422);
        }

        $user->forceFill([
            'password'       => $data['password'],
            'remember_token' => Str::random(60),
        ])->save();

        // 既存のAPIトークンを全て失効させ、使用済みリセットトークンを削除する。
        $user->tokens()->delete();
        $repository->delete($user);

        event(new PasswordReset($user));

        return response()->json(['message' => 'パスワードを再設定しました。新しいパスワードでログインしてください。']);
    }
}
