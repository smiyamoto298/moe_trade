/**
 * ビルド時に焼き込まれたビルドID。
 * define が効かない環境（開発サーバー・テスト）では undefined になり、更新監視は無効化される。
 */
export const BUILD_ID: string | undefined =
  typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : undefined
