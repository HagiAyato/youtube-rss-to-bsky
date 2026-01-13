/**
 * Blueskyに投稿（ポスト）を行うためのメイン関数。
 * 投稿テキストの文字数制限（300文字）チェック、ハッシュタグのFacet生成、
 * 外部リンクの埋め込み、サムネイル画像のアップロード、および言語設定を行います。
 * * @param {string} text 投稿本文。300文字を超過する場合はカットされます。
 * @param {string} userId Blueskyアカウントのハンドル名（例: @user.bsky.social）
 * @param {string} password BlueskyアカウントのApp Passwordまたは通常のパスワード
 * @param {string} linkText 埋め込む外部リンクカードのタイトル
 * @param {string} linkUrl 埋め込む外部リンクのURI
 * @param {string | null} thumbUrl 外部リンクカードに使用するサムネイル画像のURL。nullの場合はサムネイルなし。
 * @param {string} descText 埋め込む外部リンクカードの説明文
 */
function postToBlueSky(text, userId, password, linkText, linkUrl, thumbUrl, descText) {
  // BlueSky APIのエンドポイント
  var loginUrl = 'https://bsky.social/xrpc/com.atproto.server.createSession';
  var postUrl = 'https://bsky.social/xrpc/com.atproto.repo.createRecord';
  var uploadBlobUrl = 'https://bsky.social/xrpc/com.atproto.repo.uploadBlob';

  // null対策
  if(!descText){
    descText = "";
  }

  // ------------------------------------
  // 300文字制限処理の追加
  // ------------------------------------
  var MAX_CHARS = 300;
  
  if (text.length > MAX_CHARS) {
    // 300文字目以降をカットし、末尾に「…」を追加
    var text = text.substring(0, MAX_CHARS - 1) + '…';
  }

  // ------------------------------------
  // ハッシュタグ検出処理の追加
  // ------------------------------------
  var hashtags = detectAndCreateHashtagFacets(text);

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
  var loginResponse = fetchWithRetry(loginUrl, loginOptions);
  var loginData = JSON.parse(loginResponse.getContentText());
  var accessJwt = loginData.accessJwt;

  var postPayload = {
    repo: loginData.did,
    collection: 'app.bsky.feed.post',
    record: {
      text: text,
      // ② Facets配列をrecordに追加 (ハッシュタグがある場合のみ)
      ...(hashtags.length > 0 && { facets: hashtags }),
      embed: {
        '$type': 'app.bsky.embed.external',
        external: {
          uri: linkUrl,
          title: linkText, // 必要に応じてタイトルを変更
          description: descText // 必要に応じて説明を追加
        }
      },
      createdAt: new Date().toISOString(),
      langs: ["ja"] // 投稿言語設定
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
      var imageResponse = fetchWithRetry(thumbUrl);
      var blob = imageResponse.getBlob();

      var uploadBlobOptions = {
        method: 'post',
        contentType: blob.getContentType(),
        headers: {
          'Authorization': 'Bearer ' + accessJwt
        },
        payload: blob.getBytes()
      };

      var uploadBlobResponse = fetchWithRetry(uploadBlobUrl, uploadBlobOptions);
      var uploadBlobData = JSON.parse(uploadBlobResponse.getContentText());

      // サムネイル情報をpostPayloadに設定
      postPayload.record.embed.external.thumb = uploadBlobData.blob;
      postOptions.payload = JSON.stringify(postPayload);
    } catch (e) {
      Logger.log('画像アップロードエラー: ' + e);
      // 画像アップロードに失敗しても投稿自体は続行
    }
  }

  var postResponse = fetchWithRetry(postUrl, postOptions);
  var postData = JSON.parse(postResponse.getContentText());

  Logger.log(postData);
}

// ------------------------------------
// ハッシュタグ検出とFacet作成用のヘルパー関数
// ------------------------------------
/**
 * テキストからハッシュタグを検出し、BlueskyのFacet構造を作成します。
 * 検出ルール: #から次の区切り文字（空白、句読点、括弧など）または本文末尾まで。
 * @param {string} text 投稿本文
 * @return {Array} Facetオブジェクトの配列
 */
function detectAndCreateHashtagFacets(text) {
  var facets = [];
  // 正規表現: #で始まり、次の空白、全角スペース、改行、または行末($)まで
  // g (グローバル) と u (unicode) フラグを使用
  var regex = /[#＃]([^\s　\n.,;!?"'@()\[\]{}【】（）「」『』［］｛｝|/\\]+)/gu; 

  var match;
  while ((match = regex.exec(text)) !== null) {
    var fullMatch = match[0]; // 例: #BlueSky
    var tag = match[1];       // 例: BlueSky (ハッシュ記号を除く)

    // バイトオフセットを計算 (Bluesky APIはUTF-8バイトオフセットを要求)
    var byteStart = getByteOffset(text, match.index);
    var byteEnd = getByteOffset(text, match.index + fullMatch.length);

    // Facet構造を作成
    facets.push({
      index: {
        byteStart: byteStart,
        byteEnd: byteEnd
      },
      features: [
        {
          '$type': 'app.bsky.richtext.facet#tag',
          tag: tag // ハッシュ記号を除いたタグ名
        }
      ]
    });
  }
  return facets;
}

// ------------------------------------
// UTF-8バイトオフセット計算用のヘルパー関数 (GAS環境向け)
// ------------------------------------
/**
 * 文字列の文字インデックスに対応するUTF-8バイトオフセットを計算します。
 * @param {string} str 対象文字列
 * @param {number} charIndex 文字インデックス
 * @return {number} UTF-8バイトオフセット
 */
function getByteOffset(str, charIndex) {
  var sub = str.substring(0, charIndex);
  
  // Google Apps ScriptのUtilitiesサービスを使用してUTF-8バイト長を正確に計算
  return Utilities.newBlob(sub, 'UTF-8').getBytes().length;
}

function testPostToBlueSky() {
  //var text = 'BlueSkyへのテスト投稿です。 #タグ1 #dummy【】リンクはこちら: \n　#tag2　#タグ3 ＃タグ4,4';
  var text = '#012345678901「234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789';
  var userId = PropertiesService.getScriptProperties().getProperty('bs_uid_imas');
  var password = PropertiesService.getScriptProperties().getProperty('bs_pass_imas');
  var linkText = 'テストリンクカード';
  var linkUrl = 'https://example.com/test';
  var thumbUrl = null; 
  var descText = 'テスト投稿の説明文';

  // 全てのパラメータを渡します
  postToBlueSky(text, userId, password, linkText, linkUrl, thumbUrl, descText);
}