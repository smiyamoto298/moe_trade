/**
 * プッシュ通知が使えない状態（未対応 / ブロック中）のユーザー向けに、
 * プラットフォーム別の有効化・ブロック解除手順の文面を組み立てる。
 * MyPage の「🔕 通知がブロックされています（解除方法）」から共通ダイアログで表示する。
 */
export interface PushGuideEnv {
  /** navigator.userAgent（テスト用に差し替え可能） */
  ua?: string
  /** ホーム画面に追加した PWA として起動しているか */
  standalone?: boolean
}

export interface PushGuide {
  title: string
  message: string
  highlight?: string
}

function detect(env?: PushGuideEnv): { isIOS: boolean; isAndroid: boolean; standalone: boolean } {
  const ua = env?.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  // iPadOS 13+ の Safari は Macintosh を名乗るためタッチ対応で判別する
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document)
  const isAndroid = /Android/.test(ua)
  const standalone =
    env?.standalone ??
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true)
  return { isIOS, isAndroid, standalone }
}

/**
 * @param supported ブラウザが通知API（Notification）に対応しているか
 */
export function buildPushGuide(supported: boolean, env?: PushGuideEnv): PushGuide {
  const { isIOS, isAndroid, standalone } = detect(env)

  // ── 通知API非対応（iPhone/iPad の Safari はホーム画面追加で利用可能になる）──
  if (!supported) {
    if (isIOS) {
      return {
        title: 'プッシュ通知を利用するには',
        message: [
          'iPhone / iPad では、ホーム画面に追加したアプリからのみ通知を利用できます。',
          '',
          '1. Safari の共有ボタン（□に↑）をタップ',
          '2. 「ホーム画面に追加」を選択',
          '3. ホーム画面に追加された MoE Trade を開く',
          '4. マイページの「🔔 ブラウザ通知を有効にする」をタップ',
        ].join('\n'),
        highlight: 'iOS 16.4 以降で利用できます。',
      }
    }
    return {
      title: 'プッシュ通知を利用するには',
      message:
        'このブラウザはプッシュ通知に対応していません。\nChrome / Edge / Firefox などの対応ブラウザでご利用ください。',
    }
  }

  // ── 通知がブロック（denied）されている ──
  if (isIOS && standalone) {
    return {
      title: '通知ブロックの解除方法',
      message: [
        '通知がブロックされています。iPhone / iPad の設定から解除できます。',
        '',
        '1. 「設定」アプリを開く',
        '2. 「通知」→「MoE Trade」を選択',
        '3. 「通知を許可」をオンにする',
      ].join('\n'),
      highlight: '設定を変更したら、アプリを開き直してから「🔔 ブラウザ通知を有効にする」を押してください。',
    }
  }
  if (isAndroid) {
    return {
      title: '通知ブロックの解除方法',
      message: [
        'ブラウザでこのサイトの通知がブロックされています。',
        '',
        '【Android Chrome の場合】',
        '1. アドレスバー横の鍵（または「⋮」→「設定」→「サイトの設定」）をタップ',
        '2. 「権限」→「通知」をタップ',
        '3. 「許可」に変更する',
      ].join('\n'),
      highlight: '設定を変更したら、このページを再読み込みして「🔔 ブラウザ通知を有効にする」を押してください。',
    }
  }
  return {
    title: '通知ブロックの解除方法',
    message: [
      'ブラウザでこのサイトの通知がブロックされています。',
      '',
      '1. アドレスバー左の鍵（サイト情報）アイコンをクリック',
      '2. 「通知」を「許可」に変更する（Firefox はブロックの「×」を押して解除）',
    ].join('\n'),
    highlight: '設定を変更したら、このページを再読み込みして「🔔 ブラウザ通知を有効にする」を押してください。',
  }
}
