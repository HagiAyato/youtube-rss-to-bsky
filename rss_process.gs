/**
 * フィード定義を取得
 * 参考：https://note.com/taatn0te/n/nacada2f4dfd2
 * * @returns {Array<Object>} フィード情報オブジェクトの配列。各オブジェクトは以下のプロパティを持ちます：
 * @returns {number} return.rss_number RSSフィードに割り当てられた番号
 * @returns {string} return.name フィード名（Blueskyアカウント認証情報検索に使用）
 * @returns {string} return.link RSSフィードのURL
 */
function _getFeeds() {
  // feedsシートのA1:B最終行を取得する
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('feeds');
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();

  // mapを使用してオブジェクトの配列を生成
  return values.map(value => ({
    rss_number: value[0],
    name: value[1],
    link: value[2]
  }));
}

/**
 * 動画データから、タイトルとリンクアドレス抽出
 * 参考：Gemini
 * * @param {XmlService.Element} entry RSSフィードの単一の<entry>要素。
 * @returns {Object} 抽出された動画データ。以下のプロパティを持ちます：
 * @returns {string} return.title 動画のタイトル
 * @returns {string} return.link 動画の公開URL
 * @returns {string} return.published 動画の公開日時（'yyyy-MM-ddThh:mm:ssXXX'形式、JST）
 * @returns {string | null} return.thumbnail 動画のサムネイル画像のURL、存在しない場合はnull
 * @returns {string | null} return.description 動画の説明文、存在しない場合はnull
 */
function _getYTVideoDataFromEntry(entry) {
  const namespace = entry.getNamespace();
  const mediaNamespace = XmlService.getNamespace('http://search.yahoo.com/mrss/'); // media 名前空間を明示的に指定
  const mediaGroup = entry.getChild('group', mediaNamespace);

  const title = entry.getChild('title', namespace).getText();
  const link = entry.getChild('link', namespace).getAttribute('href').getValue();
  const published = entry.getChild('published', namespace).getText();

  let thumbnail = null;
  let description = null;

  // mediaGroupが存在する場合のみ処理
  if (mediaGroup) {
    thumbnail = mediaGroup.getChild('thumbnail', mediaNamespace)?.getAttribute('url')?.getValue() || null; // nullチェックを追加
    description = mediaGroup.getChild('description', mediaNamespace)?.getText() || null; // nullチェックを追加
  }

  // publishedの日付を変換
  const publishedDate = Utilities.formatDate(new Date(published), "JST", "yyyy-MM-dd'T'HH:mm:ssXXX");

  return {
    title: title,
    link: link,
    published: publishedDate,
    thumbnail: thumbnail,
    description: description
  };
}

/**
 * フィード名に基づき、「bluesky_define」シートから対応するBlueskyアカウントの
 * ユーザーIDとパスワードのプロパティキーを取得します。
 * * @param {string} feedName 検索対象のフィード名
 * @returns {Object} ユーザーIDとパスワードのキーを含むオブジェクト。
 * @returns {string} return.uid_key PropertiesServiceに登録されているユーザーIDのキー（見つからない場合は空文字列）
 * @returns {string} return.pass_key PropertiesServiceに登録されているパスワードのキー（見つからない場合は空文字列）
 */
function _getUserIdAndPassword(feedName) {
  // bluesky_defineシートを取得
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("bluesky_define");

  // シートが存在しない場合はエラーログを出力し、空のオブジェクトを返す
  if (!sheet) {
    Logger.log("シート'bluesky_define'が見つかりません。");
    return { uid_key: "", pass_key: "" };
  }

  // 必要な列のみ取得し、findメソッドで一致する行を検索
  const data = sheet.getRange(1, 1, sheet.getLastRow(), 3).getValues();
  const found = data.find(row => row[0] === feedName);

  // 三項演算子で結果を返す
  return found ? { uid_key: found[1], pass_key: found[2] } : { uid_key: "", pass_key: "" };
}

/**
 * メイン処理
 * RSSフィードから記事を取得し投稿
 * * @returns {void} 
 */
function main_process() {
  // フィード定義を取得
  const feeds = _getFeeds();

  // フィードごとに処理
  feeds.forEach(feed => { // for...of ループよりforEachの方が高速な場合がある
    try {
      // RSSの読み込み
      const xml = UrlFetchApp.fetch(feed.link).getContentText();
      const document = XmlService.parse(xml);
      const root = document.getRootElement();
      const namespace = root.getNamespace();
      const items = root.getChildren('entry', namespace).reverse(); // reverse()で逆順にして、新しい記事から処理

      // スプレッドシートからデータを取得
      const articlesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('articles');
      if (!articlesSheet) throw new Error("シート'articles'が見つかりません。");

      // スプレッドシートロックを取得
      const lock = LockService.getDocumentLock();
      try {
        // ロック実行
        lock.waitLock(30000)

        // 既存のURLを配列で取得
        const urls = articlesSheet.getRange(1, 3, articlesSheet.getLastRow()).getValues().flat(); // flat()で一次元配列にする

        // userID, password取得
        const credentials = _getUserIdAndPassword(feed.name);
        const userId = PropertiesService.getScriptProperties().getProperty(credentials.uid_key);
        const password = PropertiesService.getScriptProperties().getProperty(credentials.pass_key);

        // スプレッドシートに保存するデータを格納する配列
        const newArticles = [];

        // RSSから取得したデータと比較と保存
        items.forEach(item => { // for...of ループよりforEachの方が高速な場合がある
          try {
            const result = _getYTVideoDataFromEntry(item);

            // URLが一致しない場合のみ処理
            if (!urls.includes(result.link)) { // some() より includes() の方が高速

              // 現在日付時刻
              const todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

              // BlueSkyに投稿
              const text = `[${feed.name}]新着動画：\n${result.title}`;
              postToBlueSky(text, userId, password, result.title, result.link, result.thumbnail, result.description);

              // スプレッドシートへの保存データを配列に格納
              newArticles.push([feed.name, result.title, result.link, result.published, todayStr]);

              console.log(`${feed.name}: ${result.title}`);
            }
          } catch (e) {
            Logger.log(`記事処理中にエラーが発生しました：${e.message}`);
          }
        });

        // スプレッドシートへの保存をまとめて実行
        if (newArticles.length > 0) {
          articlesSheet.getRange(articlesSheet.getLastRow() + 1, 1, newArticles.length, 5).setValues(newArticles);
        }
      } catch (e) {
        Logger.log(`スプレッドシート処理中にエラーが発生しました：${e.message}`);
      } finally {
        lock.releaseLock(); // ロック解放
      }
    } catch (e) {
      Logger.log(`フィード処理中にエラーが発生しました：${e.message}`);
    }
  });
}