# MS2026 Desktop: 本番ビルド

HAL2026_MS チーム内だけで使う GitHub Desktop のフォークです。
このページでは、本番用ビルドを作ってチームに配布する手順を説明します。

## 公式 GitHub Desktop との違い

| 項目 | このビルド |
| --- | --- |
| アプリ名 | MS2026 Desktop(公式アプリと同時にインストールできます) |
| 自動更新 | **無効**。GitHub の更新サーバーには接続しません。新しいバージョンは手動で配布します |
| 利用統計 | GitHub には送信しません |
| キーチェーン / 認証情報 | 公式アプリとは別の「MS2026 Desktop」という名前で保存します |
| Windows インストーラー ID | `MS2026Desktop`(公式アプリの `GitHubDesktop` を上書きしません) |
| macOS の署名 | 署名用の証明書を指定しない場合はアドホック署名になります |

## ビルド手順

ビルドするマシンで対象 OS が決まります。Mac 版は Mac で、Windows 版は Windows でビルドしてください(クロスビルドはできません)。

```sh
yarn
yarn build:team
```

メモリ不足で失敗する場合は、先に `export NODE_OPTIONS=--max-old-space-size=8192` を実行してください。

できあがるファイル:

- **macOS**: `dist/MS2026 Desktop-arm64.zip`(Intel Mac では `-x64`)
- **Windows**: `dist/` 配下の `MS2026DesktopSetup-x64.exe` と `MS2026DesktopSetup-x64.msi`

できたファイルは、チームのビルドフォルダ(画面下のバーにある「ビルド」リンク)にアップロードしてください。

## 初回起動(チームメンバー向け)

### macOS

公証(notarization)をしていないため、初回起動時に Gatekeeper にブロックされます。

1. zip を展開し、`MS2026 Desktop.app` を「アプリケーション」フォルダへ移動します
2. アプリを右クリック →「開く」→「開く」を選びます

「壊れているため開けません」と表示された場合は、ターミナルで次のコマンドを一度だけ実行してください。

```sh
xattr -dr com.apple.quarantine "/Applications/MS2026 Desktop.app"
```

### Windows

SmartScreen で「Windows によって PC が保護されました」と表示されたら、「詳細情報」→「実行」を選んでください。

## 任意の環境変数

| 変数 | 用途 |
| --- | --- |
| `DESKTOP_MAC_SIGNING_IDENTITY` | Apple Developer ID で署名します(例: `Developer ID Application: …`)。`APPLE_ID` / `APPLE_ID_PASSWORD` / `APPLE_TEAM_ID` も設定すると公証まで行います |
| `DESKTOP_UPDATES_URL` | 自前の更新サーバー(Squirrel 互換)からの自動更新を有効にします |
| `DESKTOP_OAUTH_CLIENT_ID` / `DESKTOP_OAUTH_CLIENT_SECRET` | GitHub.com へのサインインに独自の GitHub OAuth App を使います(設定しない場合は開発用の OAuth App を使います) |

## バージョンアップ

自動更新はないため、新しいバージョンを配るときは `app/package.json` の `version` を上げてから `yarn build:team` を実行し、できたファイルを共有してください。
