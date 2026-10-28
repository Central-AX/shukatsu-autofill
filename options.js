// プロフィール登録ページ。項目は src/matcher.js の PROFILE_FIELDS から作る。保存先は chrome.storage.local のみ
'use strict';

const { PROFILE_FIELDS, DUMMY_PROFILE } = globalThis.ShukatsuMatcher;
const $ = (id) => document.getElementById(id);
const KEYS = PROFILE_FIELDS.filter((f) => f.key).map((f) => f.key);

function build() {
  const form = $('form');
  let fs = null;
  for (const f of PROFILE_FIELDS) {
    if (f.section) {
      fs = document.createElement('fieldset');
      const lg = document.createElement('legend');
      lg.textContent = f.section;
      fs.appendChild(lg);
      form.appendChild(fs);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.htmlFor = 'f_' + f.key;
    label.textContent = f.label;
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '選択してください';
      input.appendChild(blank);
      for (const o of f.options) {
        const op = document.createElement('option');
        op.value = o;
        op.textContent = o;
        input.appendChild(op);
      }
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.placeholder) input.placeholder = '例）' + f.placeholder;
    }
    input.id = 'f_' + f.key;
    input.dataset.key = f.key;
    row.append(label, input);
    fs.appendChild(row);
  }
}

function setValues(p) {
  for (const k of KEYS) $('f_' + k).value = (p && p[k]) || '';
}
function getValues() {
  const p = {};
  for (const k of KEYS) p[k] = $('f_' + k).value.trim();
  return p;
}
let msgTimer = 0;
function flash(text, warn) {
  const m = $('msg');
  m.textContent = text;
  m.className = warn ? 'warn' : '';
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { m.textContent = ''; }, 3000);
}

// 初回バナーは、未登録の間とダミー値のままの間だけ出す（自分の情報に書き換えて保存したら消える）
function isEmptyOrDummy(p) {
  if (!p || !Object.values(p).some((v) => v)) return true;
  return p.lastName === DUMMY_PROFILE.lastName && p.firstName === DUMMY_PROFILE.firstName;
}

async function save() {
  const p = getValues();
  await chrome.storage.local.set({ profile: p });
  $('firstTime').hidden = !isEmptyOrDummy(p);
  flash('保存しました');
}

build();
globalThis.ShukatsuLinks.bindLinks(document);
chrome.storage.local.get('profile').then(({ profile }) => {
  setValues(profile);
  $('firstTime').hidden = !isEmptyOrDummy(profile);
});
$('save').addEventListener('click', save);
$('dummy').addEventListener('click', () => { setValues(DUMMY_PROFILE); flash('ダミー値を入れました。「保存する」で確定します'); });
$('clear').addEventListener('click', async () => {
  if (!confirm('登録したプロフィールをすべて消去します。よろしいですか？')) return;
  setValues(null);
  await chrome.storage.local.remove('profile');
  $('firstTime').hidden = false;
  flash('消去しました', true);
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
});
