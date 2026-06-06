#!/bin/bash
set -e

echo "=== MoE Trade セットアップ ==="

# Laravelプロジェクト作成（backendディレクトリが空の場合のみ）
if [ ! -f "backend/artisan" ]; then
  echo "[1/4] Laravel プロジェクトを作成中..."
  docker compose run --rm php composer create-project laravel/laravel . --prefer-dist
else
  echo "[1/4] Laravel は既にセットアップ済みです"
fi

# .env コピー
if [ ! -f "backend/.env" ]; then
  cp backend/.env.example backend/.env
fi

# .env の DB設定を上書き
sed -i 's/DB_HOST=.*/DB_HOST=db/' backend/.env
sed -i 's/DB_DATABASE=.*/DB_DATABASE=moe_trade/' backend/.env
sed -i 's/DB_USERNAME=.*/DB_USERNAME=moe/' backend/.env
sed -i 's/DB_PASSWORD=.*/DB_PASSWORD=moe_password/' backend/.env

echo "[2/4] アプリケーションキーを生成中..."
docker compose run --rm php php artisan key:generate

echo "[3/4] コンテナを起動中..."
docker compose up -d

echo "[4/4] マイグレーション待機中..."
sleep 10
docker compose exec php php artisan migrate --force

echo ""
echo "✅ セットアップ完了！"
echo "   フロントエンド : http://localhost"
echo "   API           : http://localhost/api"
echo "   phpMyAdmin    : http://localhost:8080"
