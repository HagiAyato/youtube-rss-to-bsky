# youtube-rss-to-bsky

## 概要
YouTubeのRSSを取得し、スプレッドシートに保存した記事情報をBlueSkyに投稿するGoogle Apps Scriptプロジェクトです。

## 構成ファイル
- `rss_process.gs`  
  RSSフィードから記事情報を取得し、スプレッドシートに保存します。
- [`clean_articles.gs`](clean_articles.gs)  
  スプレッドシート「articles」シートの内容を整理し、各RSSフィードごとに最新30件＋直近1週間分のデータのみ残します。
- [`post_bluesky.gs`](post_bluesky.gs)  
  BlueSky APIを利用して、記事情報をBlueSkyに投稿します。サムネイル画像のアップロードにも対応しています。
- `appsscript.json`  
  GASプロジェクトの設定ファイル。

## 主な機能

### 記事データの整理
[`cleanUpArticlesSheet`](clean_articles.gs)  
「articles」シートの内容をRSSフィードごとにグループ化し、最新30件＋1週間以内の記事のみを残します。

### BlueSkyへの投稿
[`postToBlueSky`](post_bluesky.gs)  
BlueSky APIにログインし、記事情報（タイトル・リンク・説明・サムネイル画像）を投稿します。

### テスト投稿
[`testPostToBlueSky`](post_bluesky.gs)  
スクリプトプロパティからテスト用のユーザーID・パスワードを取得し、BlueSkyへの投稿をテストします。

## 動作環境
Google Apps Script

## 参考記事
- [GASを使ってblueskyで投稿をする方法](https://note.com/uwaaauwaaaa/n/nbcd279d4cf26)
- [GASでBlueskyのBotをつくった備忘録](https://note.com/keiga/n/n527865bcf0d5)
- [GASでRSSフィードを取得してDiscordに投稿する](https://note.com/taatn0te/n/nacada2f4dfd2)
- [GASのコードをGitHubで管理する](https://sayjoyblog.com/gas_github_connection/)
- [GASをVSCodeで開発する](https://qiita.com/BONZINE/items/f6000de23ffd3c344881)
