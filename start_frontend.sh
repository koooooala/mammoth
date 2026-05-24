#!/bin/bash
# Mammoth记账前端启动脚本
set -e
cd "$(dirname "$0")/frontend"
echo "📦 安装前端依赖..."
npm install
echo "📱 构建并启动 Expo (iOS 模拟器)..."
npx expo run:ios
