function cleanUpArticlesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('articles');

  if (!sheet) {
    Logger.log('シート "articles" が見つかりません。');
    return;
  }

  // シートロックを取得
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000); // 最大30秒間ロック取得を試みる

  try {
    var data = sheet.getDataRange().getValues();
    var header = data.shift(); // ヘッダー行を抽出
    var groupedData = {};
    var today = new Date();
    var oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);

    // RSSフィード名でデータをグループ化
    data.forEach(function(row) {
      var feedName = row[0]; // 1列目のRSSフィード名
      if (!groupedData[feedName]) {
        groupedData[feedName] = [];
      }
      groupedData[feedName].push(row);
    });

    var newData = [header]; // 新しいデータの配列（ヘッダーを含む）

    // グループごとに取得日の新しい順に30件を抽出し、1週間以内のデータも追加
    for (var feedName in groupedData) {
      var group = groupedData[feedName];
      var sortedGroup = group.slice().sort(function(a, b) {
        return new Date(b[4]) - new Date(a[4]); // 取得日で降順ソート
      });
      var count = 0;
      sortedGroup.forEach(function(row) {
        var acquisitionDate = new Date(row[4]);
        if (count < 30 || acquisitionDate >= oneWeekAgo) {
          newData.push(row);
          count++;
        }
      });
    }

    // シートの内容をクリアして新しいデータを書き込む
    sheet.clearContents();
    sheet.getRange(1, 1, newData.length, newData[0].length).setValues(newData);

    Logger.log('シート "articles" の整理が完了しました。');
  } catch (e) {
    Logger.log('シート "articles" の整理中にエラーが発生しました: ' + e.message);
  } finally {
    // ロックを解放
    lock.releaseLock();
  }
}