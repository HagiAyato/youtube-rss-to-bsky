/**
 * 指数バックオフ付きでUrlFetchAppを実行する内部ヘルパー
 * 「We're sorry, a server error occurred.」等のエラー時に再試行します。
 */
function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let i = 0; i < 5; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      if (code >= 200 && code < 300) return response;
    } catch (e) {
      lastError = e;
      // サーバーエラーやネットワークタイムアウト時にリトライ
      if (e.message.includes("502") || e.message.includes("503") || e.message.includes("504") || 
          e.message.includes("Timeout") || e.message.includes("server error")) {
        Logger.log((i + 1) + '回目リトライ実施: ' + e.message);
        const sleepTime = Math.pow(2, i) * 1000;
        Utilities.sleep(sleepTime);
        continue;
      }
      throw e;
    }
  }
  throw new Error("最大リトライ回数を超過しました: " + lastError.message);
}