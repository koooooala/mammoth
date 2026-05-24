#!/bin/bash
# Mammoth记账后端启动脚本（自动加载 .env）
set -e
cd "$(dirname "$0")/backend"

# 加载 .env 环境变量
if [ -f .env ]; then
  echo "📋 加载 .env 配置..."
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

echo "📦 检查 Go 依赖..."
go mod tidy

echo "🐘 启动Mammoth记账后端 (端口 ${PORT:-8080})..."
echo "   模型: ${ARK_MODEL:-doubao-seed-2-0-lite-260215}"
echo "   API : ${ARK_API_BASE:-https://ark.cn-beijing.volces.com/api/v3}"
echo ""
go run main.go
