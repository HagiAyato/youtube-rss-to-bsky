function postToBlueSky(text, userId, password, linkText, linkUrl, thumbUrl, descText) {
  // BlueSky APIのエンドポイント
  var loginUrl = 'https://bsky.social/xrpc/com.atproto.server.createSession';
  var postUrl = 'https://bsky.social/xrpc/com.atproto.repo.createRecord';
  var uploadBlobUrl = 'https://bsky.social/xrpc/com.atproto.repo.uploadBlob';

  // null対策
  if(!descText){
    descText = "";
  }
  // ログインリクエストの作成
  var loginPayload = {
    identifier: userId,
    password: password
  };
  var loginOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(loginPayload)
  };

  // ログインリクエストの送信
  var loginResponse = UrlFetchApp.fetch(loginUrl, loginOptions);
  var loginData = JSON.parse(loginResponse.getContentText());
  var accessJwt = loginData.accessJwt;

  var postPayload = {
    repo: loginData.did,
    collection: 'app.bsky.feed.post',
    record: {
      text: text,
      embed: {
        '$type': 'app.bsky.embed.external',
        external: {
          uri: linkUrl,
          title: linkText, // 必要に応じてタイトルを変更
          description: descText // 必要に応じて説明を追加
        }
      },
      createdAt: new Date().toISOString()
    }
  };
  var postOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + accessJwt
    },
    payload: JSON.stringify(postPayload)
  };

  // サムネイルが指定されている場合、blobをアップロードしてレコードに添付
  if (thumbUrl) {
    try {
      var imageResponse = UrlFetchApp.fetch(thumbUrl);
      var blob = imageResponse.getBlob();

      var uploadBlobOptions = {
        method: 'post',
        contentType: blob.getContentType(),
        headers: {
          'Authorization': 'Bearer ' + accessJwt
        },
        payload: blob.getBytes()
      };

      var uploadBlobResponse = UrlFetchApp.fetch(uploadBlobUrl, uploadBlobOptions);
      var uploadBlobData = JSON.parse(uploadBlobResponse.getContentText());

      // サムネイル情報をpostPayloadに設定
      postPayload.record.embed.external.thumb = uploadBlobData.blob;
      postOptions.payload = JSON.stringify(postPayload);
    } catch (e) {
      Logger.log('画像アップロードエラー: ' + e);
      // 画像アップロードに失敗しても投稿自体は続行
    }
  }

  var postResponse = UrlFetchApp.fetch(postUrl, postOptions);
  var postData = JSON.parse(postResponse.getContentText());

  Logger.log(postData);
}

function testPostToBlueSky() {
  var text = 'BlueSkyへのテスト投稿です。リンクはこちら: \n';
  var userId = PropertiesService.getScriptProperties().getProperty('bs_uid_test');
  var password = PropertiesService.getScriptProperties().getProperty('bs_pass_test');

  postToBlueSky(text, userId, password, linkText, linkUrl);
}