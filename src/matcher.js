// 就活マイページ自動入力 — 入力欄とプロフィール項目の突き合わせ（純関数のみ。DOMを触らない）
// ブラウザでは globalThis.ShukatsuMatcher に載り、fill.js / options.js から使う。
// Node からは require('../src/matcher.js') で読み、tests/ で単体テストする。
// 流れ: fill.js がページの入力欄を「記述子(descriptor)」に変換 → planFill() が何をどこに入れるかを決める → fill.js が反映。
// 外部通信なし。
(function (root) {
  'use strict';

  // ================= 定数 =================
  const PREFECTURES = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県',
    '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県',
    '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
  ];

  // プロフィール項目（options ページの入力欄もこの定義から作る）
  const PROFILE_FIELDS = [
    { section: '氏名' },
    { key: 'lastName', label: '姓', placeholder: '山田' },
    { key: 'firstName', label: '名', placeholder: '太郎' },
    { key: 'lastNameKana', label: 'セイ（全角カナ）', placeholder: 'ヤマダ' },
    { key: 'firstNameKana', label: 'メイ（全角カナ）', placeholder: 'タロウ' },
    { key: 'lastNameRoma', label: '姓（ローマ字）', placeholder: 'Yamada' },
    { key: 'firstNameRoma', label: '名（ローマ字）', placeholder: 'Taro' },
    { section: '基本情報' },
    { key: 'birthDate', label: '生年月日', type: 'date' },
    { key: 'gender', label: '性別', type: 'select', options: ['男性', '女性', 'その他', '回答しない'] },
    { key: 'email', label: 'メールアドレス', type: 'email', placeholder: 'taro@example.com' },
    { key: 'phone', label: '携帯電話番号', type: 'tel', placeholder: '090-0123-4567' },
    { section: '現住所' },
    { key: 'postalCode', label: '郵便番号', placeholder: '450-0002' },
    { key: 'prefecture', label: '都道府県', type: 'select', options: PREFECTURES },
    { key: 'city', label: '市区町村', placeholder: '名古屋市中村区' },
    { key: 'address1', label: '番地', placeholder: '名駅1-2-3' },
    { key: 'building', label: '建物名・部屋番号', placeholder: 'サンプルハイツ101' },
    { section: '学校' },
    { key: 'schoolType', label: '学校区分', type: 'select', options: ['大学', '大学院（修士）', '大学院（博士）', '短期大学', '高等専門学校', '専門学校'] },
    { key: 'university', label: '大学名', placeholder: '〇〇大学' },
    { key: 'faculty', label: '学部', placeholder: '経済学部' },
    { key: 'department', label: '学科', placeholder: '経済学科' },
    { key: 'bunri', label: '文理区分', type: 'select', options: ['文系', '理系', 'その他'] },
    { key: 'graduation', label: '卒業予定年月', type: 'month' },
  ];

  // 試し用の架空人物（実在しない大学・番地。電話は割り当ての無い 090-0 始まり、メールは予約ドメイン example.com）
  const DUMMY_PROFILE = {
    lastName: '山田', firstName: '太郎',
    lastNameKana: 'ヤマダ', firstNameKana: 'タロウ',
    lastNameRoma: 'Yamada', firstNameRoma: 'Taro',
    birthDate: '2005-06-14', gender: '男性',
    email: 'taro.yamada@example.com', phone: '090-0123-4567',
    postalCode: '450-0002', prefecture: '愛知県', city: '名古屋市中村区',
    address1: '名駅9丁目9-99', building: 'サンプルハイツ101',
    schoolType: '大学', university: 'サンプル大学', faculty: '経済学部', department: '経済学科',
    bunri: '文系', graduation: '2028-03',
  };

  // ================= 文字列の正規化・変換 =================
  // 突き合わせ用: 全角英数→半角・半角カナ→全角（NFKC）、小文字化、空白の圧縮
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  // name / id / autocomplete 用: camelCase・数字・記号の境目で区切って単語にする（lastNameKana1 → "last name kana 1"）
  function normAttr(s) {
    return norm(String(s == null ? '' : s)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')
      .replace(/[_\-\[\]\.:\/#()]+/g, ' '));
  }

  function toKatakana(s) {
    return String(s || '').replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  }
  function toHiragana(s) {
    return String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }
  const ZEN_KANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョヮヵヶー・、。「」　';
  const HAN_KANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｯｬｭｮﾜｶｹｰ･､｡｢｣ ';
  // 全角カタカナ（ひらがなも可）→ 半角カナ。濁点・半濁点は分解して ﾞ ﾟ を付ける（ガ→ｶﾞ、パ→ﾊﾟ、ヴ→ｳﾞ）
  function toHankakuKana(s) {
    const src = toKatakana(String(s || '').normalize('NFKC')).normalize('NFD');
    let out = '';
    for (const c of src) {
      if (c === '゙') { out += 'ﾞ'; continue; }
      if (c === '゚') { out += 'ﾟ'; continue; }
      const i = ZEN_KANA.indexOf(c);
      out += i >= 0 ? HAN_KANA[i] : c;
    }
    return out;
  }
  // 半角英数記号・空白 → 全角（住所欄が「全角」指定のとき用）
  function toZenkaku(s) {
    return String(s || '').replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)).replace(/ /g, '　');
  }

  // 電話番号を3分割する。ハイフン付きで保存されていればそれに従う。無ければ 11桁=3-4-4、10桁=2-4-4
  function splitPhone(phone) {
    const raw = String(phone || '').normalize('NFKC').trim();
    const byHyphen = raw.split(/[-‐－ー―\s]+/).filter(Boolean);
    if (byHyphen.length === 3 && byHyphen.every((p) => /^\d+$/.test(p))) return byHyphen;
    const d = raw.replace(/\D/g, '');
    if (d.length === 11) return [d.slice(0, 3), d.slice(3, 7), d.slice(7)];
    if (d.length === 10) return [d.slice(0, 2), d.slice(2, 6), d.slice(6)];
    return d ? [d] : [];
  }
  function splitPostal(code) {
    const d = String(code || '').normalize('NFKC').replace(/\D/g, '');
    return d.length === 7 ? [d.slice(0, 3), d.slice(3)] : (d ? [d] : []);
  }
  // 'YYYY-MM-DD' / 'YYYY/M/D' / 'YYYY年M月D日' → { y, m, d }（数値）
  function parseDate(s) {
    const m = /(\d{4})\D+(\d{1,2})(?:\D+(\d{1,2}))?/.exec(String(s || '').normalize('NFKC'));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: m[3] ? +m[3] : null };
  }
  const pad2 = (n) => String(n).padStart(2, '0');

  // ================= 項目の推定 =================
  // 対象外にする欄（帰省先・保護者・パスワード等）。ここに当たったら何も入れない
  const EXCLUDE_RE = /帰省|休暇中|緊急|保護者|家族|パスワード|password|暗証|captcha|認証コード|確認コード|検索|search|所在地|入学|高校|ユーザー ?名|user ?name|user ?id|login|ログイン|ニックネーム|nickname|クーポン|coupon|会社名|企業名|勤務先|年齢|\bfax\b|ファックス/;

  // 名前系の判定に使う語。「大学名」「学部名」などの「名」を名(メイ)と取り違えないよう、先に取り除く
  const NAME_STRIP_RE = /大学名|学校名|学部名|学科名|研究科名|専攻名|会社名|企業名|名称|署名|件名|名古屋|名義|名字|苗字|氏名|お名前|名前|姓名/g;
  const NAME_RE = /氏名|名前|姓|名字|苗字|名|\bname\b|shimei|namae|\bsei\b|\bmei\b|セイ|メイ|せい|めい|フリガナ|ふりがな|カナ|かな|ローマ字|romaji/;
  const SEI_RE = /姓|苗字|名字|セイ|せい|\bsei\b|\blast\b|family|surname|\blname\b/;
  const MEI_RE = /名|メイ|めい|\bmei\b|\bfirst\b|given|\bfname\b|forename/;
  const KANA_RE = /カナ|かな|フリガナ|ふりがな|カタカナ|ひらがな|セイ|メイ|せい|めい|\bkana\b|furigana|katakana|hiragana|\byomi\b|読み/;
  const ROMA_RE = /ローマ字|英字|英語|アルファベット|romaji|roman|\broma\b|alphabet|english|\ben\b|\beng\b/;

  // 上から順に試す。re に当たったら key（handler があれば handler の戻り値）を採用
  const RULES = [
    { key: 'email', re: /メール|e ?mail|\bmail\b|mailaddress/ },
    { key: 'postal', re: /郵便|〒|\bzip\b|zipcode|postal|post ?code|yubin/ },
    { key: 'birth', re: /生年月日|誕生日|生年|birth|\bbday\b|\bdob\b|seinengappi|tanjobi/ },
    { key: 'graduation', re: /卒業|卒年|graduat|\bgrad\b|sotsugyo/ },
    { key: 'gender', re: /性別|\bgender\b|\bsex\b|seibetsu/ },
    { key: 'bunri', re: /文理|bunri|文系|理系/ },
    { key: 'schoolType', re: /学校区分|学校種別|学校の種類|学校種類|在籍区分|学歴区分|school ?type|school ?kind/ },
    { key: 'prefecture', re: /都道府県|address ?level ?1|\bpref(ecture)?\b|todofuken|\bstate\b|\bregion\b/ },
    { key: 'building', re: /建物|マンション|アパート|号室|部屋番号|building|apartment|address ?line ?2|住所 ?2|address ?2\b/,
      handler: (t) => (/番地|丁目/.test(t) ? 'address1Building' : 'building') },
    { key: 'city', re: /市区町村|市町村|市区郡|address ?level ?2|\bcity\b|shikuchoson/,
      handler: (t) => (/番地|丁目|町名/.test(t) ? 'cityAddress' : 'city') },
    { key: 'address1', re: /番地|丁目|町名|address ?line ?1|\bstreet\b|banchi/ },
    { key: 'cityAddress', re: /住所 ?1|address ?1\b/ },
    { key: 'phone', re: /携帯|電話|\btel(ephone)?\b|phone|mobile|keitai|denwa/,
      handler: (t, all) => (/自宅|固定|\bhome\b/.test(all) && !/携帯|mobile|keitai|cell/.test(all) ? null : 'phone') },
    { key: 'university', re: /大学|学校|university|college|school|daigaku|gakko/,
      handler: (t, all) => (KANA_RE.test(all) || ROMA_RE.test(all) ? null : 'university') },
    { key: 'faculty', re: /学部|研究科|faculty|gakubu/,
      handler: (t) => (/学科|専攻/.test(t) ? 'facultyDept' : 'faculty') },
    { key: 'department', re: /学科|専攻|コース|department|major|gakka|\bdept\b/ },
    { key: 'addressFull', re: /住所|address|jusho/ },
    { key: 'name', re: NAME_RE, name: true },
  ];

  // 記述子から突き合わせ用の文字列を作る。
  // specific: その欄に固有の手がかり（直前の小見出し・label[for]・placeholder・aria-label・name/id/autocomplete）
  // label: 行の見出し（表の th、dl の dt、fieldset の legend など）
  function descTexts(d) {
    const attrs = [d.name, d.id, d.autocomplete].filter(Boolean).map(normAttr).join(' ');
    const specific = norm([d.near, d.placeholder, d.ariaLabel].filter(Boolean).join(' ')) + (attrs ? ' ' + attrs : '');
    const label = norm(d.label);
    return { specific: specific.trim(), label, all: (specific + ' ' + label).trim() };
  }

  function nameKey(t, texts) {
    // 種別（漢字 / カナ / ローマ字）は全体の文字列から、姓・名の区別はより固有な手がかりから決める
    const cat = ROMA_RE.test(texts.all) ? 'roma' : (KANA_RE.test(texts.all) ? 'kana' : 'name');
    const partOf = (s) => {
      const sei = SEI_RE.test(s);
      const mei = MEI_RE.test(s.replace(NAME_STRIP_RE, ' '));
      if (sei && !mei) return 'last';
      if (mei && !sei) return 'first';
      return null;
    };
    const part = partOf(texts.specific) || partOf(texts.label) || 'full';
    return cat + '.' + part;
  }

  function matchRules(t, texts) {
    for (const r of RULES) {
      const target = r.name ? t.replace(NAME_STRIP_RE, (m) => (/氏名|お名前|名前|姓名|名字|苗字/.test(m) ? m : ' ')) : t;
      if (!r.re.test(target)) continue;
      if (r.name) return nameKey(t, texts);
      return r.handler ? r.handler(t, texts.all) : r.key; // handler(今照合している文字列, 両方を合わせた文字列)
    }
    return undefined; // 当たりなし（null は「当たったが対象外」）
  }

  // 1つの入力欄が何の項目か推定する。戻り値: 'email' | 'name.last' | 'kana.full' ... | null
  function classify(d) {
    if (!d) return null;
    const texts = descTexts(d);
    if (!texts.all) return null;
    if (EXCLUDE_RE.test(texts.label) || EXCLUDE_RE.test(texts.specific)) return null;
    // 固有の手がかりで決まればそれを優先（「学部・学科」行の中の「学科」欄など）。決まらなければ行見出しで判定
    if (texts.specific) {
      const k = matchRules(texts.specific, texts);
      if (k !== undefined) return k;
    }
    if (texts.label) {
      const k = matchRules(texts.label, texts);
      if (k !== undefined) return k;
    }
    return null;
  }

  // ================= 分割欄の判定 =================
  // select の選択肢の数字から 年/月/日 を推定
  function optionNumbers(options) {
    return (options || []).filter((o) => !isPlaceholderOption(o)).map((o) => firstNumber(o.text) ?? firstNumber(o.value)).filter((n) => n != null);
  }
  function firstNumber(s) {
    const m = /\d+/.exec(String(s == null ? '' : s).normalize('NFKC'));
    return m ? parseInt(m[0], 10) : null;
  }
  function datePart(d) {
    const after = norm(d.after);
    if (/^年/.test(after)) return 'year';
    if (/^月/.test(after)) return 'month';
    if (/^日/.test(after)) return 'day';
    const attrs = [d.name, d.id, d.autocomplete].filter(Boolean).map(normAttr).join(' ');
    if (/\b(year|yyyy|yy|y|nen)\b/.test(attrs)) return 'year';
    if (/\b(month|mm|m|tsuki)\b/.test(attrs)) return 'month';
    if (/\b(day|dd|d)\b/.test(attrs)) return 'day';
    const ph = norm(d.placeholder);
    if (/^(yyyy|yy|年|西暦|\d{4})$/.test(ph)) return 'year';
    if (/^(mm?|月)$/.test(ph)) return 'month';
    if (/^(dd?|日)$/.test(ph)) return 'day';
    if (d.tag === 'select') {
      const nums = optionNumbers(d.options);
      if (nums.length) {
        const min = Math.min(...nums), max = Math.max(...nums);
        if (min >= 1900 && max <= 2100) return 'year';
        if (min >= 1 && max <= 12) return 'month';
        if (min >= 1 && max <= 31) return 'day';
      }
    }
    if (d.maxLength === 4) return 'year';
    return null;
  }
  const NAME_PARTS = ['last', 'first'];
  // グループ（同じ行で同じ項目が連続する欄）の各欄に、何番目の部品を入れるか割り当てる
  function assignParts(key, members) {
    const base = key.split('.')[0];
    if (base === 'birth' || base === 'graduation') {
      const order = base === 'birth' ? ['year', 'month', 'day'] : ['year', 'month'];
      if (members.length === 1) return [null];
      const explicit = members.map(datePart);
      const used = new Set(explicit.filter(Boolean));
      const rest = order.filter((p) => !used.has(p));
      return explicit.map((p) => p || rest.shift() || null);
    }
    if (key.endsWith('.full')) {
      if (members.length === 1) return [null];
      return members.map((_, i) => NAME_PARTS[i] || null);
    }
    if (base === 'postal' || base === 'phone') {
      if (members.length === 1) return [null];
      return members.map((_, i) => i);
    }
    return members.map(() => null);
  }
  const GROUPABLE = new Set(['postal', 'phone', 'birth', 'graduation', 'name.full', 'kana.full', 'roma.full']);

  // ================= 値の決定 =================
  function hintOf(d) {
    return norm([d.near, d.placeholder, d.ariaLabel, d.label, d.note].filter(Boolean).join(' '));
  }
  // カナ欄の書式: 'half'（半角カナ）| 'hira'（ひらがな）| 'full'（全角カタカナ）
  function kanaStyle(d) {
    const raw = String(d.placeholder || '');
    if (/[ｦ-ﾟ]/.test(raw)) return 'half';
    const h = hintOf(d);
    if (/半角(カタ)?カナ/.test(h)) return 'half';
    if (/全角/.test(h)) return /ひらがな/.test(h) ? 'hira' : 'full';
    if (/半角/.test(h)) return 'half';
    if (/[ぁ-ゖ]{2,}/.test(raw.replace(/例|ふりがな/g, '')) && !/[ァ-ヶ]/.test(raw)) return 'hira';
    if (/ひらがな|ふりがな/.test(h) && !/カタカナ|カナ|フリガナ/.test(h)) return 'hira';
    return 'full';
  }
  function styleKana(s, style) {
    const kata = toKatakana(String(s || '').normalize('NFKC'));
    if (style === 'half') return toHankakuKana(kata);
    if (style === 'hira') return toHiragana(kata);
    return kata;
  }
  function wantsUpper(d) {
    const raw = String(d.placeholder || '').normalize('NFKC');
    if (/大文字|uppercase|capital/.test(hintOf(d))) return true;
    return /[A-Z]{2,}/.test(raw) && !/[a-z]/.test(raw);
  }
  const NO_HYPHEN_RE = /ハイフン(なし|無し|不要|抜き|を除|を含めない|は不要|を入れない|は入れない)|数字のみ|ハイフン\(-\)なし/;
  const WITH_HYPHEN_RE = /ハイフン(あり|有り|付き|つき|を含め|を入れ)/;
  function hyphenPolicy(d, digitsLen) {
    const h = hintOf(d);
    if (NO_HYPHEN_RE.test(h)) return false;
    if (WITH_HYPHEN_RE.test(h)) return true;
    const ph = String(d.placeholder || '').normalize('NFKC');
    if (/\d-\d/.test(ph)) return true;
    if (new RegExp('(^|\\D)\\d{' + digitsLen.join(',') + '}(\\D|$)').test(ph)) return false;
    if (d.maxLength > 0 && d.maxLength <= digitsLen[digitsLen.length - 1]) return false;
    return true;
  }
  function zenkakuIfAsked(d, s) {
    const h = hintOf(d);
    return /全角/.test(h) && !/半角/.test(h) ? toZenkaku(s) : s;
  }

  // select / radio 用の候補。texts: 文字の候補（上から優先）、num: 数値で比べる値、ym: [年, 月]
  const CHOICE_SYNONYMS = {
    gender: {
      '男性': ['男性', '男', 'male', 'man'], '女性': ['女性', '女', 'female', 'woman'],
      'その他': ['その他', 'other'], '回答しない': ['回答しない', '無回答', '答えない', '回答しません', '選択しない', 'no answer'],
    },
    bunri: { '文系': ['文系', '文科系', '文科'], '理系': ['理系', '理科系', '理科'], 'その他': ['その他'] },
    schoolType: {
      '大学': ['大学', '4年制大学', '四年制大学', '大学(学部)', 'university'],
      '大学院（修士）': ['大学院(修士)', '大学院修士課程', '修士', '大学院(博士前期)', '大学院'],
      '大学院（博士）': ['大学院(博士)', '大学院博士課程', '博士', '大学院(博士後期)', '大学院'],
      '短期大学': ['短期大学', '短大'], '高等専門学校': ['高等専門学校', '高専'], '専門学校': ['専門学校', '専修学校'],
    },
  };
  function prefCandidates(p) {
    const s = String(p || '').trim();
    if (!s) return [];
    return s === '北海道' ? [s] : [s, s.replace(/[都府県]$/, '')];
  }

  // 1つの欄に入れる値を決める。text 欄なら { text }、select / radio なら { texts, num, ym }。入れる値が無ければ null
  function valueFor(key, part, d, p, ctx) {
    const choice = d.tag === 'select' || d.tag === 'radio';
    const [base, namePart] = key.split('.');
    const pick = (np) => {
      if (base === 'name') return np === 'last' ? p.lastName : np === 'first' ? p.firstName : null;
      if (base === 'kana') return np === 'last' ? p.lastNameKana : np === 'first' ? p.firstNameKana : null;
      if (base === 'roma') return np === 'last' ? p.lastNameRoma : np === 'first' ? p.firstNameRoma : null;
      return null;
    };
    const text = (v) => (v == null || String(v).trim() === '' ? null : (choice ? { texts: [String(v)] } : { text: String(v) }));

    if (base === 'name' || base === 'kana' || base === 'roma') {
      const np = namePart === 'full' ? part : namePart;
      let v;
      if (np) v = pick(np);
      else {
        const a = pick('last'), b = pick('first');
        if (!a && !b) return null;
        const sep = base === 'name' || (base === 'kana' && kanaStyle(d) !== 'half') ? '　' : ' ';
        v = [a, b].filter(Boolean).join(sep);
      }
      if (!v) return null;
      if (base === 'kana') {
        const style = kanaStyle(d);
        v = styleKana(v, style); // NFKC で全角空白は半角になる → 全角カナ・ひらがなの欄では全角空白に戻す
        if (style !== 'half') v = v.replace(/ /g, '　');
      }
      if (base === 'roma') v = wantsUpper(d) ? v.toUpperCase() : v;
      return text(v);
    }
    switch (key) {
      case 'email': return text(p.email);
      case 'phone': {
        const parts = splitPhone(p.phone);
        if (!parts.length) return null;
        if (typeof part === 'number') {
          if (part === 1 && ctx.groupSize === 2) return text(parts.slice(1).join(''));
          return text(parts[part]);
        }
        return text(hyphenPolicy(d, [10, 11]) ? parts.join('-') : parts.join(''));
      }
      case 'postal': {
        const parts = splitPostal(p.postalCode);
        if (!parts.length) return null;
        if (typeof part === 'number') return text(parts[part]);
        return text(hyphenPolicy(d, [7]) ? parts.join('-') : parts.join(''));
      }
      case 'birth':
      case 'graduation': {
        const dt = parseDate(key === 'birth' ? p.birthDate : p.graduation);
        if (!dt) return null;
        if (part === 'year' || part === 'month' || part === 'day') {
          const n = part === 'year' ? dt.y : part === 'month' ? dt.m : dt.d;
          if (n == null) return null;
          if (choice) return { texts: [String(n)], num: n };
          const ph = norm(d.placeholder);
          return text(part !== 'year' && /^(mm|dd|\d\d)$/.test(ph) ? pad2(n) : String(n));
        }
        if (key === 'graduation') {
          if (choice) return { texts: [dt.y + '年' + dt.m + '月'], ym: [dt.y, dt.m] };
          if (d.type === 'month') return text(dt.y + '-' + pad2(dt.m));
          const ph = String(d.placeholder || '').normalize('NFKC');
          if (/\d{6}/.test(ph) || d.maxLength === 6) return text(dt.y + pad2(dt.m));
          if (/\d{4}\/\d/.test(ph)) return text(dt.y + '/' + pad2(dt.m));
          if (/\d{4}-\d/.test(ph)) return text(dt.y + '-' + pad2(dt.m));
          return text(dt.y + '年' + dt.m + '月');
        }
        if (dt.d == null) return null;
        if (choice) return null;
        if (d.type === 'date') return text(dt.y + '-' + pad2(dt.m) + '-' + pad2(dt.d));
        const ph = String(d.placeholder || '').normalize('NFKC');
        if (/\d{8}/.test(ph) || d.maxLength === 8) return text('' + dt.y + pad2(dt.m) + pad2(dt.d));
        if (/\d{4}-\d/.test(ph)) return text(dt.y + '-' + pad2(dt.m) + '-' + pad2(dt.d));
        if (/年/.test(ph)) return text(dt.y + '年' + dt.m + '月' + dt.d + '日');
        return text(dt.y + '/' + pad2(dt.m) + '/' + pad2(dt.d));
      }
      case 'gender':
      case 'bunri':
      case 'schoolType': {
        const v = p[key];
        if (!v) return null;
        if (!choice) return text(v);
        const syn = CHOICE_SYNONYMS[key][v] || [];
        return { texts: [v].concat(syn) };
      }
      case 'prefecture':
        if (!p.prefecture) return null;
        return choice ? { texts: prefCandidates(p.prefecture) } : text(zenkakuIfAsked(d, p.prefecture));
      case 'city': return text(p.city && zenkakuIfAsked(d, p.city));
      case 'address1': {
        // 建物名の欄がフォームに無ければ、番地の欄に建物名もつなげる
        const v = [p.address1, ctx.has.has('building') || ctx.has.has('address1Building') ? '' : p.building].filter(Boolean).join(' ');
        return text(v && zenkakuIfAsked(d, v));
      }
      case 'address1Building': return text(zenkakuIfAsked(d, [p.address1, p.building].filter(Boolean).join(' ')));
      case 'building': return text(p.building && zenkakuIfAsked(d, p.building));
      case 'cityAddress': {
        const tail = ctx.has.has('building') || ctx.has.has('address1Building') ? '' : (p.building ? ' ' + p.building : '');
        const v = (p.city || '') + (p.address1 || '') + tail;
        return text(v && zenkakuIfAsked(d, v));
      }
      case 'addressFull': {
        const head = ctx.has.has('prefecture') ? '' : (p.prefecture || '');
        const v = head + (p.city || '') + (p.address1 || '') + (p.building ? ' ' + p.building : '');
        return text(v && zenkakuIfAsked(d, v));
      }
      case 'university': return text(p.university);
      case 'faculty': return text(p.faculty);
      case 'department': return text(p.department);
      case 'facultyDept': return text([p.faculty, p.department].filter(Boolean).join(' '));
      default: return null;
    }
  }

  // ================= select / radio の選択肢の一致 =================
  function isPlaceholderOption(o) {
    if (!o) return true;
    const t = norm(o.text);
    return (o.value === '' && !/\d/.test(t)) || /選択|選んで|未選択|please select|^select\b|^-+$|^ー+$|^―+$/.test(t);
  }
  const loose = (s) => norm(s).replace(/[\s()（）・\-ー―]/g, '');
  // options: [{ text, value }]、spec: { texts, num, ym } → 選ぶ option の添字（無ければ -1）
  function matchOption(options, spec) {
    if (!options || !spec) return -1;
    const list = options.map((o, i) => ({ i, o, t: loose(o.text), v: loose(o.value) })).filter((x) => !isPlaceholderOption(x.o));
    const texts = (spec.texts || []).map(loose).filter(Boolean);
    // 1) 文字の完全一致（表示テキスト → value の順）
    for (const c of texts) {
      const hit = list.find((x) => x.t === c) || list.find((x) => x.v === c);
      if (hit) return hit.i;
    }
    // 2) 数値で一致（"04" と "4月"、"2005年（平成17年）" など）
    if (spec.num != null) {
      const hit = list.find((x) => firstNumber(x.o.text) === spec.num) || list.find((x) => firstNumber(x.o.value) === spec.num);
      if (hit) return hit.i;
    }
    // 3) 年月の一致（"2028年3月卒業見込み" など）
    if (spec.ym) {
      const hit = list.find((x) => {
        const nums = (String(x.o.text).normalize('NFKC').match(/\d+/g) || []).map(Number);
        return nums.length >= 2 && nums[0] === spec.ym[0] && nums[1] === spec.ym[1];
      });
      if (hit) return hit.i;
    }
    // 4) 部分一致。候補を含む選択肢（前方一致・短いほど優先）→ 候補に含まれる選択肢（2文字以上）
    let best = -1, bestScore = -Infinity;
    for (const c of texts) {
      if (c.length < 2) continue;
      for (const x of list) {
        let score = -Infinity;
        if (x.t.includes(c)) score = 1000 - (x.t.length - c.length) + (x.t.startsWith(c) ? 100 : 0);
        else if (x.t.length >= 2 && c.includes(x.t)) score = 500 - (c.length - x.t.length);
        if (score > bestScore) { bestScore = score; best = x.i; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // ================= 入力済み判定 =================
  function isFilled(d) {
    if (d.tag === 'radio') return (d.options || []).some((o) => o.checked);
    if (d.tag === 'select') {
      const i = d.selectedIndex;
      if (i == null || i < 0 || !d.options || !d.options[i]) return false;
      if (isPlaceholderOption(d.options[i])) return false;
      // 先頭の選択肢がブラウザ既定で選ばれているだけ（selected 属性なし）なら未入力とみなす
      return i > 0 || !!d.explicitDefault;
    }
    return String(d.value || '').trim() !== '';
  }

  // ================= 全体の計画 =================
  // descs: ページ上の入力欄の記述子（文書順）、profile: 保存したプロフィール
  // 戻り値: [{ index, key, kind: 'text', value } | { index, key, kind: 'select' | 'radio', optionIndex }]
  function planFill(descs, profile) {
    const p = profile || {};
    const keys = descs.map((d) => classify(d));
    const has = new Set(keys.filter(Boolean));
    const actions = [];
    const sameRow = (a, b) => norm(a.label) === norm(b.label);
    let i = 0;
    while (i < descs.length) {
      const key = keys[i];
      if (!key) { i++; continue; }
      let j = i + 1;
      if (GROUPABLE.has(key)) {
        while (j < descs.length && keys[j] === key && sameRow(descs[i], descs[j])) j++;
      }
      const members = descs.slice(i, j);
      const parts = assignParts(key, members);
      members.forEach((d, k) => {
        if (isFilled(d)) return;
        const v = valueFor(key, parts[k], d, p, { has, groupSize: members.length });
        if (!v) return;
        const index = i + k;
        if (d.tag === 'select' || d.tag === 'radio') {
          const optionIndex = matchOption(d.options, v);
          if (optionIndex >= 0) actions.push({ index, key, kind: d.tag, optionIndex });
        } else if (v.text != null) {
          actions.push({ index, key, kind: 'text', value: v.text });
        }
      });
      i = j;
    }
    return actions;
  }

  const api = {
    PREFECTURES, PROFILE_FIELDS, DUMMY_PROFILE,
    norm, normAttr, toKatakana, toHiragana, toHankakuKana, toZenkaku,
    splitPhone, splitPostal, parseDate,
    classify, datePart, assignParts, kanaStyle, valueFor, matchOption, isPlaceholderOption, isFilled, planFill,
  };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.ShukatsuMatcher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
