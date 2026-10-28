// ポップアップ: ボタン1つで、今開いているタブのフォームをプロフィールで埋める
// activeTab + scripting で、押したときだけそのタブに src/matcher.js と src/fill.js を注入する（常駐スクリプトなし・外部通信なし）
'use strict';

const $ = (id) => document.getElementById(id);

function show(text, cls) {
  const s = $('status');
  s.textContent = text;
  s.className = cls || '';
}

async function loadProfile() {
  const { profile } = await chrome.storage.local.get('profile');
  return profile && Object.values(profile).some((v) => String(v || '').trim()) ? profile : null;
}

async function inject(tabId, allFrames, profile) {
  const target = { tabId, allFrames };
  await chrome.scripting.executeScript({ target, files: ['src/matcher.js', 'src/fill.js'] });
  return chrome.scripting.executeScript({
    target,
    func: (p) => (globalThis.__shukatsuAutofill ? globalThis.__shukatsuAutofill.run(p) : { filled: 0 }),
    args: [profile],
  });
}

// 指定タブを埋めて、入力した項目数を返す
async function fillTab(tabId) {
  const profile = await loadProfile();
  if (!profile) return { error: 'noprofile' };
  let results;
  try {
    results = await inject(tabId, true, profile);
  } catch (e) {
    // 別ドメインの iframe などで全フレーム注入に失敗したら、トップのフレームだけで再挑戦
    results = await inject(tabId, false, profile);
  }
  const filled = (results || []).reduce((n, r) => n + ((r && r.result && r.result.filled) || 0), 0);
  return { filled };
}

async function onFill() {
  const btn = $('fill');
  btn.disabled = true;
  show('入力中…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('タブが見つかりません');
    const r = await fillTab(tab.id);
    if (r.error === 'noprofile') {
      show('先にプロフィールを登録してください（下のリンクから）', 'warn');
    } else if (r.filled > 0) {
      show(r.filled + '項目を入力しました', 'ok');
    } else {
      show('入力できる空欄が見つかりませんでした（入力済みの欄は上書きしません）', 'warn');
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/cannot access|cannot be scripted|chrome:\/\/|extensions gallery|file:\/\//i.test(msg)) {
      show('このページでは使えません（Chromeの設定画面・ストア・権限のないファイルなど）', 'warn');
    } else {
      show('入力できませんでした: ' + msg, 'warn');
    }
  } finally {
    btn.disabled = false;
  }
}

$('fill').addEventListener('click', onFill);
$('openOptions').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
globalThis.ShukatsuLinks.bindLinks(document);

// 未登録なら最初から案内を出す
loadProfile().then((p) => { if (!p) show('先にプロフィールを登録してください（下のリンクから）', 'warn'); });
