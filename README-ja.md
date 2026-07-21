<div align="center">
  <img src="assets/banner.svg" alt="Nova Banner" width="800" />
</div>

<p align="center">
  <strong>パーソナライズされたマルチエージェント学習プラットフォーム · あらゆるテーマをインタラクティブな授業に</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README-zh.md">中文</a> · <a href="./README-ja.md">日本語</a>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" alt="Next.js" /></a>
  <a href="#"><img src="https://img.shields.io/badge/React-19-149eca?logo=react" alt="React" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss" alt="Tailwind" /></a>
  <a href="#"><img src="https://img.shields.io/badge/License-MIT-green" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Tests-2768%20passed-success" alt="Tests" /></a>
  <a href="#"><img src="https://img.shields.io/badge/LLM-20%2B%20providers-8b5cf6" alt="LLM Providers" /></a>
  <a href="#"><img src="https://img.shields.io/badge/i18n-8%20languages-pink" alt="i18n" /></a>
</p>

<p align="center">
  <a href="#機能">機能</a> ·
  <a href="#クイックスタート">クイックスタート</a> ·
  <a href="#アーキテクチャ">アーキテクチャ</a> ·
  <a href="#テスト">テスト</a> ·
  <a href="#プロジェクト構成">構成</a> ·
  <a href="#コントリビュート">コントリビュート</a>
</p>

---

## 概要

Nova はマルチエージェント型のインテリジェント教学プラットフォームです。学習トピックを入力すると、AI 教師が自動的に構造化されたカリキュラムを作成し、スライドを生成し、ナレーション原稿を書き、バーチャル教室でリアルタイムに授業を行います。複数の AI エージェントが役割を分担 — 教師が講義をリードし、アシスタントが質問に答え、ムードメーカーが場を和ませます。

コアコンセプト: 単なるスライドジェネレーターではなく、役割分担、安全ガードレール、ナレッジトラッキングを備えた完全な教学システムです。

## 機能

### コース生成

- **AI アウトライン生成** — トピックを知識依存関係に基づく段階的なシーンに自動分割
- **スライド制作** — 各シーンにタイトル、要点、フローチャートを含むスライドを自動生成
- **音声ナレーション** — AI 教師が複数の TTS エンジンで自然な音声により各シーンを解説
- **インタラクティブ小テスト** — 選択問題と穴埋め問題を自動生成し、リアルタイムに学習効果を評価
- **ナレッジグラフ** — コース全体の概念の関連性を可視化
- **PBL モード** — プロジェクトベース学習でインタラクティブな実習タスクを生成

### マルチエージェント教室

| エージェント | 役割 | 権限 |
|-------------|------|------|
| AI 教師 | 授業を主導、核心概念を解説 | 発言、スライド操作、スポットライト、ホワイトボード |
| AI アシスタント | 教師を補助、質問に回答 | 発言、ホワイトボード、スライド操作 |
| ムードメーカー | 雰囲気を調整 | 発言 |

- **ロール永続化** — 10 種類の組み込みロールの名称、説明、権限をカスタマイズ可能。変更はセッション間で保持
- **ランタイム制約** — 各ロールの最大アクション数と発言ターン数をランタイムで強制
- **ディスカッション制御** — Director Graph がエージェント間の発言順序と議論フローを管理

### プロンプトエンジニアリングとガバナンス

- **34 テンプレート** — アウトライン生成、コンテンツ作成、アクション順序付け、小テスト生成をカバー
- **スニペットシステム** — ロールガイドラインとアクションタイプを Markdown スニペットとして管理。再コンパイル不要で編集可能
- **安全ガードレール** — PII 検出、毒性フィルタリング、ハルシネーションスキャンを各シーンで実行
- **スkills レジストリ** — 5 つの登録スキルをホワイトリストでゲート
- **REST API** — `GET /api/prompts` でテンプレート一覧、`GET /api/skills` でスキル一覧

### インフラストラクチャ

<details>
<summary><strong>20 以上の LLM プロバイダ</strong></summary>

| プロバイダ | 代表モデル |
|-----------|-----------|
| OpenAI | GPT-4o, GPT-4o-mini |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus |
| Google | Gemini 2.0 Flash, Gemini 1.5 Pro |
| DeepSeek | DeepSeek-V4-Pro, DeepSeek-V4-Flash |
| Qwen | Qwen3.5-397B, Qwen3.6-35B |
| GLM | GLM-5.2, GLM-5.1 |
| Kimi | Kimi-K2.6 |
| MiniMax | MiniMax-M3 |
| SiliconFlow | 全モデル集約 |
| Doubao | Doubao シリーズ |
| Ollama | ローカルモデル |
| Lemonade | ローカル AMD モデル |

</details>

- **TTS** — OpenAI、SiliconFlow、Doubao、Minimax、Volcano
- **画像生成** — SiliconFlow、Minimax、ComfyUI
- **ウェブ検索** — Tavily、SearXNG
- **ドキュメント解析** — AliDocMind、MinerU
- **MCP ツール** — Model Context Protocol 経由で外部ツールを接続
- **国際化** — 英語、簡体字中国語、繁体字中国語、日本語、韓国語、アラビア語、ポルトガル語、ロシア語
- **ダークモード** — サイト全体でサポート

## アーキテクチャ

<div align="center">
  <img src="assets/architecture.svg" alt="Nova アーキテクチャ図" width="800" />
</div>

データフロー: ユーザーがトピックを入力 → プロンプトエンジンがプロンプトを組み立て → LLM がコンテンツを生成 → ガードレールが安全性をスキャン → マルチエージェントオーケストレーション → インタラクティブ教室のレンダリング。 Zustand によりブラウザのローカルストレージに永続化されます。

## クイックスタート

### 前提条件

- Node.js 22+
- pnpm 10+

### インストール

```bash
git clone https://github.com/weed33834/nova.git
cd nova
pnpm install
```

### 設定

`.env.local` ファイルを作成し、少なくとも 1 つの LLM プロバイダを設定します:

```bash
# 方法 A: API キーを直接設定
SILICONFLOW_API_KEY=your-key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1

# 方法 B: サーバーサイド管理設定（推奨）
cp server-providers.example.yml server-providers.yml
# server-providers.yml に資格情報を入力 — キーはサーバー側に留まります
```

### 実行

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000) を開き、学びたいトピックを入力するだけです。

### API キーなしで体験

ホームページの **「キャッシュデモコースを開く」** をクリックすると、API キーなしで「人工知能入門」コースを読み込み、すぐに教室 UI を体験できます。

## テスト

```bash
pnpm test          # ユニット & コンポーネントテスト（312 ファイル / 2768 ケース）
pnpm test:e2e      # エンドツーエンドテスト（Playwright）
pnpm test:e2e:ui   # インタラクティブ UI 付き E2E
pnpm lint          # ESLint
pnpm typecheck     # TypeScript 型チェック
```

E2E テストは全フローをカバー: ホーム → 生成 → 教室ナビゲーション → 小テスト操作。すべてモック API を使用 — LLM キー不要です。

## プロジェクト構成

```
nova/
├── app/                  # Next.js App Router
│   ├── api/              # API ルート（prompts, skills, generate/*）
│   └── [locale]/         # 国際化ルーティング
├── lib/                  # コアロジック
│   ├── ai/               # マルチ LLM プロバイダ統合
│   ├── agent/            # マルチエージェントランタイム
│   ├── choreography/     # アニメーション & エフェクト
│   ├── guardrails/       # 安全パイプライン
│   ├── orchestration/    # ロール管理 & 制約
│   └── prompts/          # プロンプトテンプレート & スニペット
├── components/           # React コンポーネント
├── packages/             # ワークスペースサブパッケージ
│   └── @nova/
│       ├── dsl/          # ドメイン型定義
│       ├── renderer/     # スライドレンダリングエンジン
│       ├── importer/     # ドキュメントインポート
│       └── storage/      # 永続化レイヤー
├── e2e/                  # Playwright テスト
├── configs/              # 共有定数
└── assets/               # 静的アセット & ロゴ
```

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Next.js 16（App Router, Turbopack） |
| 言語 | TypeScript 5.8 |
| UI | React 19, Tailwind CSS 4, Radix UI |
| 状態 | Zustand（永続化） |
| AI | Vercel AI SDK、マルチプロバイダ |
| テスト | Vitest, Playwright |
| パッケージマネージャー | pnpm Workspaces |

## コントリビュート

Issue とプルリクエストを歓迎します。提出前に [CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。

## ライセンス

[MIT](LICENSE)
