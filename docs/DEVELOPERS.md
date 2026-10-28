# 開発者向けメモ

利用者向けの説明は [README.md](../README.md)。ここには仕組み・テスト・配布の手順を置く。

## 構成

| パス | 役割 |
|---|---|
| `manifest.json` | Manifest V3。権限は `storage` `activeTab` `scripting` のみ。`host_permissions` は持たない |
| `background.js` | service worker。`chrome.runtime.onInstalled` の reason が `install` のときだけオプションページを開く |
| `popup.*` | ツールバーのポップアップ。「このページを自動入力」ボタン |
| `options.*` | プロフィール登録ページ。項目は `src/matcher.js` の `PROFILE_FIELDS` から生成する |
| `src/matcher.js` | 欄→項目の推定と、入れる値の決定（純関数。Node のテストからも読む） |
| `src/fill.js` | ページの欄を集めて記述子にし、`matcher` の計画どおりに値を入れる |
| `src/links.js` | 拡張ページで使う外部リンク（試し用ページ・作者クレジット）の定数。URLはここだけで管理する |
| `demo/mypage.html` | 試し用の架空マイページ（GitHub Pages で公開する想定。送信はしない） |
| `tests/matcher.test.js` | `matcher` の単体テスト |
| `scripts/package.ps1` | 配布用ZIPを作る |

外部への通信はしない。プロフィールはこのPCのChrome内（`chrome.storage.local`）にだけ保存する。ボタンを押したタブにだけ、押した瞬間に処理を注入する（常駐スクリプトなし）。

## 仕組み
- ポップアップのボタン → `chrome.scripting.executeScript` で今のタブに `src/matcher.js` と `src/fill.js` を注入して実行（別ドメインの iframe で失敗したらトップのフレームだけで再挑戦）
- `src/fill.js`: ページの input / select / textarea / radio（radio は name ごとに1つ）を「記述子」にする。手がかりは、行の見出し（表の th、dl の dt、fieldset の legend、見出しらしい要素）、欄の直前の小見出し（「姓」「名」「〒」など）、`label[for]`、placeholder、aria-label、name / id / autocomplete、直後の文字（「年」「月」「日」）、行の注記（「※半角カナで」など）、maxlength、select の選択肢
- `src/matcher.js`（純関数）: 記述子から項目を推定し（欄固有の手がかりを優先し、決まらなければ行見出し）、同じ行で同じ項目が続く欄は分割欄として部品を割り当て、入れる値・選ぶ選択肢を決める
- 値はネイティブの value setter で入れて `input` / `change` を発火する（React などのフォームでも反映される）。ラジオは `click()`。ハイライトは Web Animations API なので、ページのスタイルを書き換えない
- 既に値が入っている欄は上書きしない。同意のチェックボックス・パスワード欄は触らない

## 対応している欄の形（詳細）
| 項目 | 対応している形 |
|---|---|
| 氏名・フリガナ・ローマ字 | 姓/名が別欄でも1欄でも。「氏名」行に欄が2つあれば姓・名に分ける。カナは「半角」指定（ラベル・注記・placeholder が半角カナ）なら半角カナ、「ふりがな」「ひらがな」ならひらがな、それ以外は全角カタカナ。ローマ字は「大文字」指定や placeholder が大文字なら大文字 |
| 生年月日・卒業予定年月 | 年/月/日の select（「2005年」「6月」「06」などの書き方の違いも可）、`type=date` / `type=month`、1欄テキスト（placeholder の書式に合わせる） |
| 電話・郵便番号 | 3分割・3桁-4桁の分割欄、1欄（「ハイフンなし」の指定や桁数制限があればハイフンを抜く） |
| メール | 確認用（「確認」「再入力」）の欄にも同じ値 |
| 住所 | 都道府県 select（「愛知県」「愛知」どちらの選択肢でも）、市区町村・番地・建物名。「住所」1欄や「市区町村・番地」のようなまとめ欄はつないで入れる。「全角」指定の住所欄は英数字を全角に |
| 学校 | 学校区分・大学名・学部・学科（「学部・学科」1欄ならつなぐ）・文理区分（select / ラジオ、「文科系」などの言い換えも可） |
| 性別 | select / ラジオ（「男」「男性」など） |

入れない欄: 帰省先・休暇中の連絡先・保護者・緊急連絡先・自宅電話・FAX・パスワード・ユーザー名・大学のフリガナ・入学年月・出身高校・自己PRなど。

## 制限
- サイトによっては見出しの付け方が独特で推定できない欄がある。その欄は空のまま残る
- 郵便番号から住所を自動で引くサイトでは、入力後にサイト側の処理が住所欄を書き換えることがある
- 先頭の選択肢が実在の値（例: 年の select の先頭が「1995」）で、`selected` が付いていない select は未入力として扱う。ほかの欄の「入力済み」判定は値の有無だけ
- Chromeの設定画面・ウェブストアなど、拡張が触れないページでは「このページでは使えません」と出る
- `file://` のページで使うには、拡張の詳細で「ファイルの URL へのアクセスを許可する」をONにする必要がある

## テスト
```
node --test tests/matcher.test.js
```
ラベル→項目の推定、カナ変換、分割欄、select の一致、全体の計画（デモページと同じ構成で全欄が埋まるか、入力済みを上書きしないか）を DOM なしで確かめる単体テスト。

## デモページをローカルで開く
```
cd demo
python -m http.server 8000
```
Chromeで `http://localhost:8000/mypage.html` を開き、拡張のボタン →「このページを自動入力」。28欄が埋まり、ポップアップに「28項目を入力しました」と出る。もう一度試すときはページを再読み込みして空にする（入力済みの欄は上書きしないため）。

## 配布用ZIPを作る
Windows PowerShell 5.1 で:
```
powershell -ExecutionPolicy Bypass -File scripts\package.ps1
```
実行に必要なファイル（`manifest.json` `background.js` `popup.*` `options.*` `src/` `icons/`）だけを `dist/shukatsu-autofill/` に集め、`dist/shukatsu-autofill-v<manifestのversion>.zip` を作る。ZIPを解凍すると `shukatsu-autofill/manifest.json` になる。ZIP内のパス区切りは `/`（Mac などで解凍しても崩れない）。`dist/` は git 管理外。

リリース時は `manifest.json` の `version` を上げてからZIPを作り、GitHub の Releases に添付する。

## スクリーンショット
`docs/*.png` は Playwright（Chromium）で、配布用ZIPを解凍した拡張を読み込んで撮影したもの。
- `options_empty.png` / `options_dummy_saved.png`: インストール直後に開くプロフィール登録ページ（未登録／ダミー保存後）
- `popup_noprofile.png` / `popup_after.png`: ポップアップ（未登録／デモページを埋めた後）
- `demo_before.png` / `demo_after.png`: デモページの入力前／入力後
- `demo_filling.png`: 入力中のハイライト

Playwright からはツールバーの拡張ボタンを押せず `activeTab` が付与されないため、自動入力の撮影は、検証用コピーの manifest に `host_permissions`（`http://127.0.0.1/*`）を足したうえで、ポップアップの `fillTab()` を呼んで行った。配布物の manifest には足していない。
