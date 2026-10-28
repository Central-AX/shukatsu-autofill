// 就活マイページ自動入力 — ページ側の処理（ポップアップから chrome.scripting.executeScript で注入する）
// 1) ページの input / select / textarea / radio を記述子に変換（行見出し・直前の小見出し・placeholder・name/id など）
// 2) ShukatsuMatcher.planFill() で入れる値を決める
// 3) ネイティブの value setter で値を入れ、input / change を発火（React等のフォームでも反映される）。入れた欄を薄い緑で光らせる
// 既に値が入っている欄は上書きしない。チェックボックス（同意欄など）は触らない。外部通信なし。
(function () {
  'use strict';
  const M = globalThis.ShukatsuMatcher;
  if (!M) return;

  const SKIP_TYPES = new Set(['hidden', 'password', 'checkbox', 'submit', 'button', 'reset', 'file', 'image', 'range', 'color', 'search', 'url']);
  const CONTROL_SEL = 'input, select, textarea, button';
  const MAX_LABEL = 60;

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const short = (s, n) => { const t = clean(s); return t.length > (n || MAX_LABEL) ? t.slice(0, n || MAX_LABEL) : t; };

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  // 要素のテキスト（中のフォーム部品の文字は除く）
  function textWithoutControls(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.matches(CONTROL_SEL + ', option, script, style')) return '';
    let s = '';
    for (const c of node.childNodes) s += textWithoutControls(c) + ' ';
    return s;
  }
  const hasControl = (node) => node.nodeType === Node.ELEMENT_NODE && (node.matches(CONTROL_SEL) || !!node.querySelector(CONTROL_SEL));

  // 直前（または直後）の兄弟にある短い文字（「姓」「名」「年」「月」など）。別の入力欄に当たったら止める
  function siblingText(el, dir) {
    let n = dir < 0 ? el.previousSibling : el.nextSibling;
    while (n) {
      if (hasControl(n)) return '';
      const t = clean(textWithoutControls(n));
      if (t) return t.length <= 20 ? t : '';
      n = dir < 0 ? n.previousSibling : n.nextSibling;
    }
    return '';
  }

  function labelFor(el) {
    if (el.id) {
      try {
        const l = el.ownerDocument.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (l) return short(textWithoutControls(l));
      } catch (_) { /* 不正なid */ }
    }
    return '';
  }
  function ariaLabelledby(el) {
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return short(ids.map((id) => { const n = el.ownerDocument.getElementById(id); return n ? n.textContent : ''; }).join(' '));
  }

  // 行の見出し: 表の th、dl の dt、小さい fieldset の legend、見出しらしい要素
  function rowLabel(el) {
    const td = el.closest('td');
    if (td && td.parentElement) {
      const th = td.parentElement.querySelector(':scope > th');
      if (th) return short(textWithoutControls(th));
    }
    const dd = el.closest('dd');
    if (dd) {
      let p = dd.previousElementSibling;
      while (p && p.tagName !== 'DT') p = p.previousElementSibling;
      if (p) return short(textWithoutControls(p));
    }
    const fs = el.closest('fieldset');
    if (fs && fs.querySelectorAll(CONTROL_SEL).length <= 12) {
      const lg = fs.querySelector(':scope > legend');
      if (lg) return short(textWithoutControls(lg));
    }
    // 汎用: 祖先をさかのぼり、その塊の最初の入力欄より前にある見出しらしい要素（入力欄を含まない短い文字）を探す
    // （「姓 [ ] 名 [ ]」の「名」のように、入力欄の間にある小見出しは行見出しにしない）
    let a = el.parentElement;
    for (let depth = 0; a && depth < 5; depth++, a = a.parentElement) {
      const first = a.querySelector(CONTROL_SEL);
      const heads = a.querySelectorAll(':scope > label, :scope > [class*="label" i], :scope > [class*="title" i], :scope > [class*="ttl" i], :scope > [class*="head" i], :scope > dt, :scope > th, :scope > legend, :scope > p, :scope > span');
      for (const h of heads) {
        if (h.contains(el) || hasControl(h)) continue;
        if (first && !(h.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const t = short(textWithoutControls(h));
        if (t) return t;
      }
      // 入力欄が他にもたくさんある塊まで上がったら止める（別の行の見出しを拾わない）
      if (a.querySelectorAll(CONTROL_SEL).length > 4) break;
    }
    return '';
  }
  // 行の補足（「※半角カナで入力」「ハイフンなし」など）。書式の判断にだけ使う
  function rowNote(el) {
    const box = el.closest('td, dd, .form-row, .field, li') || el.parentElement;
    return box ? short(textWithoutControls(box), 120) : '';
  }

  function baseDesc(el, label) {
    const lf = labelFor(el);
    const wrap = el.closest('label');
    const wrapText = wrap ? short(textWithoutControls(wrap)) : '';
    const near = [wrapText, lf && lf !== label ? lf : '', siblingText(el, -1)].filter(Boolean);
    return {
      name: el.getAttribute('name') || '',
      id: el.id || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || ariaLabelledby(el),
      near: Array.from(new Set(near)).join(' '),
      after: siblingText(el, 1),
      label,
      note: rowNote(el),
      maxLength: typeof el.maxLength === 'number' ? el.maxLength : -1,
    };
  }

  function radioOptionText(r) {
    const lf = labelFor(r);
    if (lf) return lf;
    const wrap = r.closest('label');
    if (wrap) return short(textWithoutControls(wrap));
    return siblingText(r, 1);
  }

  // ページの入力欄を文書順に記述子へ。radio は name ごとに1つの記述子にまとめる
  function collect(doc) {
    const items = [];
    const seenRadio = new Set();
    for (const el of doc.querySelectorAll('input, select, textarea')) {
      if (el.disabled || el.readOnly) continue;
      const tag = el.tagName.toLowerCase();
      const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
      if (tag === 'input' && SKIP_TYPES.has(type)) continue;
      if (type === 'radio') {
        const key = (el.form ? 'f' : 'd') + ':' + el.name;
        if (!el.name || seenRadio.has(key)) continue;
        seenRadio.add(key);
        const scope = el.form || doc;
        const radios = Array.from(scope.querySelectorAll('input[type="radio"]')).filter((r) => r.name === el.name && !r.disabled && isVisible(r));
        if (!radios.length) continue;
        const d = baseDesc(el, rowLabel(el));
        d.near = ''; d.after = ''; d.placeholder = ''; // 各ボタンの文字は選択肢として扱い、項目の推定には使わない
        Object.assign(d, { tag: 'radio', type: 'radio', options: radios.map((r) => ({ text: radioOptionText(r), value: r.value, checked: r.checked })) });
        items.push({ el, radios, desc: d });
        continue;
      }
      if (!isVisible(el)) continue;
      const d = baseDesc(el, rowLabel(el));
      d.tag = tag === 'textarea' ? 'textarea' : tag;
      d.type = type;
      if (tag === 'select') {
        d.options = Array.from(el.options).map((o) => ({ text: o.text, value: o.value }));
        d.selectedIndex = el.selectedIndex;
        d.explicitDefault = Array.from(el.options).some((o) => o.defaultSelected);
      } else {
        d.value = el.value;
      }
      items.push({ el, desc: d });
    }
    return items;
  }

  // ---------- 値の反映 ----------
  function nativeSet(el, prop, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc && desc.set) desc.set.call(el, value); else el[prop] = value;
  }
  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur'));
  }
  function highlight(el) {
    if (!el || typeof el.animate !== 'function') return;
    const on = { backgroundColor: '#d3f4de', boxShadow: '0 0 0 3px rgba(46, 160, 90, 0.35)' };
    try {
      el.animate([Object.assign({ offset: 0 }, on), Object.assign({ offset: 0.45 }, on)], { duration: 1100, easing: 'ease-out' });
    } catch (_) { /* 古いブラウザは光らせない */ }
  }
  function apply(item, action) {
    const { el } = item;
    if (action.kind === 'text') {
      nativeSet(el, 'value', action.value);
      fire(el);
      highlight(el);
    } else if (action.kind === 'select') {
      const opt = el.options[action.optionIndex];
      const dup = Array.from(el.options).filter((o) => o.value === opt.value).length > 1;
      if (dup) nativeSet(el, 'selectedIndex', action.optionIndex); else nativeSet(el, 'value', opt.value);
      fire(el);
      highlight(el);
    } else if (action.kind === 'radio') {
      const r = item.radios[action.optionIndex];
      if (!r.checked) r.click(); // click で checked・input・change が通常どおり発生する
      highlight(r.closest('label') || r.parentElement);
    }
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // profile を使ってこのページ（このフレーム）を埋める。戻り値: { filled, keys }
  async function run(profile, opts) {
    const interval = opts && typeof opts.interval === 'number' ? opts.interval : 30;
    const items = collect(document);
    const plan = M.planFill(items.map((x) => x.desc), profile);
    let filled = 0;
    const keys = [];
    for (let k = 0; k < plan.length; k++) {
      const a = plan[k];
      try {
        apply(items[a.index], a);
        filled++;
        keys.push(a.key);
      } catch (e) {
        console.warn('[就活自動入力] 入力できなかった欄', a, e);
      }
      if (interval > 0 && k < plan.length - 1) await sleep(interval);
    }
    return { filled, keys };
  }

  globalThis.__shukatsuAutofill = { run, collect };
})();
