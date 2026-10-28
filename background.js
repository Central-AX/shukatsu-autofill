// service worker: インストール直後だけプロフィール登録ページを開いて、最初の使い方を案内する
// （更新・Chromeの更新では開かない。権限は追加しない）
'use strict';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
