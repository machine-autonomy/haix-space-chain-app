# Space Chain Explorer

Space Chain Explorerは、3D迷路探索とAIエージェント制御を組み合わせたReact + Three.jsアプリケーションです。

## 概要

このアプリケーションは、一人称視点での3D迷路探索を提供します。手動での操作に加え、VLM（Vision Language Model）やASCIIマップモードを使用したAIエージェントによる自律的な探索が可能です。

### 主な機能

- **3D迷路探索**: リアルタイム3Dレンダリングによる一人称視点での迷路探索
- **手動操作**: WASDキーによるプレイヤー移動
- **AIエージェントモード**: VLMを使用した自律的な迷路探索
- **ASCIIマップモード**: テキストベースのマップ表示とAI制御
- **ミニマップ**: 現在位置と移動履歴を表示するオーバーレイマップ
- **マニュアルテストモード**: AIレスポンスを手動で入力してテスト可能

## 技術スタック

- **React 18** - UIフレームワーク
- **TypeScript** - 型安全な開発
- **Vite** - 高速なビルドツール
- **Three.js** - 3Dグラフィックス
- **@react-three/fiber** - React用Three.jsレンダラー
- **@react-three/drei** - 便利なThree.jsヘルパー

## セットアップ

使うLLMに合わせて.env ファイルを作成
.env.sample.azure - azure openaiを使う際の設定のサンプル
.env.sample.local - LM studio等を使う際のサンプル

### 必要な環境

- Node.js 18以上
- npm または yarn

### インストール

```bash
# 依存関係をインストール
npm install
```

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` にアクセスしてください。

### ビルド

```bash
npm run build
```

### リント

```bash
npm run lint
```

## 使い方

### 手動モード

1. アプリケーションを起動
2. WASDキーで移動:
   - **W**: 前進
   - **S**: 後退
   - **A**: 左回転
   - **D**: 右回転

### AIエージェントモード

1. 「START AGENT (VLM)」ボタンをクリック
2. エージェントが自動的に迷路を探索します
3. 「STOP AGENT」で停止

### マニュアルテストモード

1. 「Manual Test Mode」チェックボックスをオン
2. 「START AGENT」でエージェントを開始
3. 表示される画像またはASCIIマップをコピー
4. VLM（GPT-4 Vision、Claude等のビジョン対応AI）にプロンプトと共に送信
5. レスポンスをJSON形式で入力
6. 「Inject Action」でアクションを実行

### ASCIIマップモード

1. 「ASCII Map Mode」チェックボックスをオン
2. テキストベースの迷路表示でエージェントが探索
