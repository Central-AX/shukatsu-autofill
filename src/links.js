// 拡張ページ（ポップアップ・オプション）で使う外部リンクの定数。URLを変えるときはここだけ直す
'use strict';

(function (root) {
  const LINKS = {
    // 試し用のデモページ（GitHub Pages で公開する demo/mypage.html）
    DEMO_URL: 'https://central-ax.github.io/shukatsu-autofill/demo/mypage.html',
    // 作者クレジット
    CREDIT_URL: 'https://www.youtube.com/@matsujun_ai',
  };

  // data-link="DEMO_URL" などを付けた a 要素に URL を入れ、クリックで新しいタブに開く
  // （ポップアップ内のリンクは普通に開けないため chrome.tabs.create を使う）
  function bindLinks(doc) {
    for (const a of doc.querySelectorAll('a[data-link]')) {
      const url = LINKS[a.dataset.link];
      if (!url) continue;
      a.href = url;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url });
      });
    }
  }

  root.ShukatsuLinks = { ...LINKS, bindLinks };
})(globalThis);
