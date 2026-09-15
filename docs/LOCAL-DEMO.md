# えいごのひろば ローカルデモ

## 構成

- Moodle 5.2系（`moodle` ディレクトリ、`MOODLE_502_STABLE`）
- Moodle Docker Compose + PostgreSQL 17 + PHP 8.4
- H5Pコア／H5P活動プラグイン有効
- 起動URL: http://localhost:8000

## Git

- fork: `https://github.com/take365/eigo-hiroba-demo`
- upstream: `https://github.com/moodlehq/moodle-docker`
- 開発ブランチ: `feature/initial-local-demo`

## 起動

PowerShellでリポジトリ直下から実行する。

```powershell
$env:MOODLE_DOCKER_WWWROOT = (Resolve-Path .\moodle).Path
$env:MOODLE_DOCKER_DB = 'pgsql'
$env:MOODLE_DOCKER_PHP_VERSION = '8.4'
$env:MOODLE_DOCKER_DB_VERSION = '17'
.\bin\moodle-docker-compose.cmd up -d
```

停止は `.\bin\moodle-docker-compose.cmd down`。DBデータはDockerボリュームに保持される。

## 初期デモ教材（コースID 2）

コース名は「えいごのひろば｜Unit 1 あいさつ」、セクション名は「Unit 1｜あいさつを使おう」。

1. **A｜あいさつ単語カード** — Hello / Good morning / Goodbye の意味を確認
2. **B｜ミニクイズ（選択式）** — 3問の選択問題と答え合わせ
3. **C｜会話練習（Let’s talk!）** — A/B会話の音読、役割交代、応用チャレンジ

現時点は画面確認を優先した初期教材（Moodle Page）で、次の段階でB/CをH5Pのインタラクティブ教材へ置き換える。

## 次の実装候補

1. H5P Interactive Book／Question Setへの移行
2. 先生・児童のデモユーザー作成と手動登録
3. 児童の完了条件・評定、先生の進捗画面確認
4. 音声素材（発音）とスマートフォン表示の調整

## 子ども向け画面の起動

OpenAI APIを使う場合は、`OPENAI_API_KEY`を設定したPowerShellで以下を実行する。キーはブラウザへ渡さず、`app/server.mjs`が中継する。

```powershell
node .\app\server.mjs
```

http://localhost:4173/ で開く。「おとを きく」は `audio/speech` で生成した音声をローカルキャッシュし、「いってみる」は録音後に音声認識APIで単語を確認する。発音の音素採点ではなく、まずは聞き取り結果に基づくやさしいフィードバックを行う。
