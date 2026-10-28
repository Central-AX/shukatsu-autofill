// 突き合わせロジック（src/matcher.js の純関数）の単体テスト。DOM不要。実行: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/matcher.js');

const D = (o) => Object.assign({ tag: 'input', type: 'text', name: '', id: '', placeholder: '', near: '', after: '', label: '', value: '', maxLength: -1 }, o);
const sel = (o, texts, values) => D(Object.assign({ tag: 'select', type: 'select', selectedIndex: 0,
  options: texts.map((t, i) => ({ text: t, value: values ? values[i] : (i === 0 ? '' : t) })) }, o));
const P = M.DUMMY_PROFILE;
const textOf = (actions, i) => { const a = actions.find((x) => x.index === i); return a ? a.value : undefined; };
const optOf = (actions, i) => { const a = actions.find((x) => x.index === i); return a ? a.optionIndex : undefined; };

// ---------- ラベル → 項目の推定 ----------
test('classify: 行見出しだけで決まる基本項目', () => {
  const cases = {
    'メールアドレス': 'email', 'メールアドレス（確認用）': 'email', 'E-mail': 'email',
    '郵便番号': 'postal', '〒': 'postal', '都道府県': 'prefecture', '市区町村': 'city', '番地': 'address1',
    '建物名・部屋番号': 'building', '携帯電話番号': 'phone', '電話番号': 'phone', '生年月日': 'birth',
    '性別': 'gender', '大学名': 'university', '学校名': 'university', '学部': 'faculty', '学部名': 'faculty',
    '学科': 'department', '専攻': 'department', '文理区分': 'bunri', '卒業予定年月': 'graduation',
    '学校区分': 'schoolType', '住所': 'addressFull', '市区町村・番地': 'cityAddress', '番地・建物名': 'address1Building',
    '学部・学科': 'facultyDept',
  };
  for (const [label, key] of Object.entries(cases)) assert.equal(M.classify(D({ label })), key, label);
});
test('classify: 氏名・カナ・ローマ字の姓/名', () => {
  assert.equal(M.classify(D({ label: '姓' })), 'name.last');
  assert.equal(M.classify(D({ label: '名' })), 'name.first');
  assert.equal(M.classify(D({ label: '氏名' })), 'name.full');
  assert.equal(M.classify(D({ label: 'お名前' })), 'name.full');
  // 行見出し「氏名」＋欄ごとの小見出し
  assert.equal(M.classify(D({ label: '氏名', near: '姓' })), 'name.last');
  assert.equal(M.classify(D({ label: '氏名', near: '名' })), 'name.first');
  assert.equal(M.classify(D({ label: '氏名', placeholder: '名' })), 'name.first');
  // カナ: 行見出しでカナと分かり、placeholder で姓/名が分かる
  assert.equal(M.classify(D({ label: 'フリガナ', placeholder: 'セイ' })), 'kana.last');
  assert.equal(M.classify(D({ label: 'フリガナ（半角カナ）', placeholder: 'ﾒｲ' })), 'kana.first');
  assert.equal(M.classify(D({ label: 'フリガナ', near: '姓' })), 'kana.last'); // 「フリガナ」行の中の「姓」欄
  assert.equal(M.classify(D({ label: 'セイ' })), 'kana.last');
  assert.equal(M.classify(D({ label: 'ふりがな' })), 'kana.full');
  // ローマ字
  assert.equal(M.classify(D({ label: '氏名（ローマ字）', near: '名' })), 'roma.first');
  assert.equal(M.classify(D({ label: '氏名（ローマ字）' })), 'roma.full');
});
test('classify: name / id / autocomplete からも推定する', () => {
  assert.equal(M.classify(D({ name: 'last_name' })), 'name.last');
  assert.equal(M.classify(D({ name: 'firstNameKana' })), 'kana.first');
  assert.equal(M.classify(D({ id: 'kana_sei' })), 'kana.last');
  assert.equal(M.classify(D({ name: 'mei_en' })), 'roma.first');
  assert.equal(M.classify(D({ name: 'sei_roma' })), 'roma.last');
  assert.equal(M.classify(D({ autocomplete: 'family-name' })), 'name.last');
  assert.equal(M.classify(D({ autocomplete: 'postal-code' })), 'postal');
  assert.equal(M.classify(D({ autocomplete: 'address-level1' })), 'prefecture');
  assert.equal(M.classify(D({ autocomplete: 'address-level2' })), 'city');
  assert.equal(M.classify(D({ autocomplete: 'address-line1' })), 'address1');
  assert.equal(M.classify(D({ autocomplete: 'address-line2' })), 'building');
  assert.equal(M.classify(D({ name: 'zip1' })), 'postal');
  assert.equal(M.classify(D({ name: 'tel2' })), 'phone');
  assert.equal(M.classify(D({ name: 'email_confirm' })), 'email');
  assert.equal(M.classify(D({ name: 'school_name' })), 'university');
  assert.equal(M.classify(D({ name: 'birth_year' })), 'birth');
});
test('classify: 「名」を含む別の語（大学名・学部名など）を名(メイ)と取り違えない', () => {
  assert.equal(M.classify(D({ label: '大学名', placeholder: '例）〇〇大学' })), 'university');
  assert.equal(M.classify(D({ label: '学部名' })), 'faculty');
  assert.equal(M.classify(D({ label: '学科名' })), 'department');
});
test('classify: 固有の手がかり（小見出し）を行見出しより優先する', () => {
  assert.equal(M.classify(D({ label: '学部・学科', near: '学部' })), 'faculty');
  assert.equal(M.classify(D({ label: '学部・学科', near: '学科' })), 'department');
});
test('classify: 対象外の欄は null', () => {
  for (const label of ['帰省先住所', '帰省先電話番号', '休暇中の連絡先', '保護者氏名', 'パスワード', 'パスワード（確認）', '自宅電話番号', 'FAX番号',
    '大学所在地', 'ユーザー名', '入学年月', '出身高校', '自己PR', '']) {
    assert.equal(M.classify(D({ label })), null, label);
  }
  assert.equal(M.classify(D({ label: '電話番号（携帯または自宅）' })), 'phone');
  assert.equal(M.classify(D({ label: '大学名（フリガナ）' })), null);
  assert.equal(M.classify(null), null);
});

// ---------- カナ・文字の変換 ----------
test('toHankakuKana: 濁点・半濁点・長音・小書き・空白', () => {
  assert.equal(M.toHankakuKana('ヤマダ タロウ'), 'ﾔﾏﾀﾞ ﾀﾛｳ');
  assert.equal(M.toHankakuKana('ガギグゲゴ パピプペポ ヴ'), 'ｶﾞｷﾞｸﾞｹﾞｺﾞ ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ ｳﾞ');
  assert.equal(M.toHankakuKana('シューカツ　ジョウ'), 'ｼｭｰｶﾂ ｼﾞｮｳ');
  assert.equal(M.toHankakuKana('やまだ'), 'ﾔﾏﾀﾞ'); // ひらがなも半角カナへ
});
test('toKatakana / toHiragana', () => {
  assert.equal(M.toKatakana('やまだ たろう'), 'ヤマダ タロウ');
  assert.equal(M.toHiragana('ヤマダ　タロウ'), 'やまだ　たろう');
});
test('toZenkaku: 住所の英数記号を全角に', () => {
  assert.equal(M.toZenkaku('名駅9丁目9-99 101'), '名駅９丁目９－９９　１０１');
});
test('kanaStyle: ラベル・placeholder から書式を判断', () => {
  assert.equal(M.kanaStyle(D({ label: 'フリガナ（半角カナ）' })), 'half');
  assert.equal(M.kanaStyle(D({ label: 'フリガナ', placeholder: '例）ﾔﾏﾀﾞ' })), 'half');
  assert.equal(M.kanaStyle(D({ label: 'フリガナ', note: '※半角カタカナで入力してください' })), 'half');
  assert.equal(M.kanaStyle(D({ label: 'フリガナ（全角カナ）' })), 'full');
  assert.equal(M.kanaStyle(D({ label: 'フリガナ' })), 'full');
  assert.equal(M.kanaStyle(D({ label: 'ふりがな' })), 'hira');
  assert.equal(M.kanaStyle(D({ label: '氏名（かな）', placeholder: '例）やまだ' })), 'hira');
});

// ---------- 分割 ----------
test('splitPhone / splitPostal / parseDate', () => {
  assert.deepEqual(M.splitPhone('090-0123-4567'), ['090', '0123', '4567']);
  assert.deepEqual(M.splitPhone('09001234567'), ['090', '0123', '4567']);
  assert.deepEqual(M.splitPhone('０９０ー０１２３ー４５６７'), ['090', '0123', '4567']);
  assert.deepEqual(M.splitPhone('052-123-4567'), ['052', '123', '4567']);
  assert.deepEqual(M.splitPhone(''), []);
  assert.deepEqual(M.splitPostal('450-0002'), ['450', '0002']);
  assert.deepEqual(M.splitPostal('〒4500002'), ['450', '0002']);
  assert.deepEqual(M.parseDate('2005-06-14'), { y: 2005, m: 6, d: 14 });
  assert.deepEqual(M.parseDate('2028-03'), { y: 2028, m: 3, d: null });
});
test('datePart: 年/月/日 の手がかり', () => {
  assert.equal(M.datePart(D({ after: '年' })), 'year');
  assert.equal(M.datePart(D({ name: 'birth_month' })), 'month');
  assert.equal(M.datePart(D({ placeholder: 'DD' })), 'day');
  assert.equal(M.datePart(sel({}, ['--', '1', '2', '12'])), 'month');
  assert.equal(M.datePart(sel({}, ['--', '1', '15', '31'])), 'day');
  assert.equal(M.datePart(sel({}, ['--', '2004', '2005'])), 'year');
  assert.equal(M.datePart(D({ maxLength: 4 })), 'year');
});

test('planFill: 郵便番号 3桁-4桁・電話 3分割', () => {
  const descs = [
    D({ label: '郵便番号', maxLength: 3 }), D({ label: '郵便番号', maxLength: 4 }),
    D({ label: '携帯電話番号', name: 'tel1' }), D({ label: '携帯電話番号', name: 'tel2' }), D({ label: '携帯電話番号', name: 'tel3' }),
  ];
  const a = M.planFill(descs, P);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => textOf(a, i)), ['450', '0002', '090', '0123', '4567']);
});
test('planFill: 1欄の郵便番号・電話はハイフンの指定に従う', () => {
  const a = M.planFill([
    D({ label: '郵便番号' }), D({ label: '郵便番号（ハイフンなし）' }), D({ label: '〒', maxLength: 7 }),
    D({ label: '電話番号', placeholder: '09012345678' }), D({ label: '携帯電話', placeholder: '090-1234-5678' }),
  ], P);
  // 連続する同じ項目でも、行見出しが違えば分割グループにしない
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => textOf(a, i)), ['450-0002', '4500002', '4500002', '09001234567', '090-0123-4567']);
});
test('planFill: 生年月日 年/月/日 の select（選択肢の文字は「2005年」「6月」でも、値が「06」でもよい）', () => {
  const years = ['選択'].concat(Array.from({ length: 16 }, (_, i) => (1995 + i) + '年'));
  const months = ['--'].concat(Array.from({ length: 12 }, (_, i) => String(i + 1)));
  const monthVals = [''].concat(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')));
  const days = ['--'].concat(Array.from({ length: 31 }, (_, i) => (i + 1) + '日'));
  const descs = [sel({ label: '生年月日' }, years), sel({ label: '生年月日' }, months, monthVals), sel({ label: '生年月日' }, days)];
  const a = M.planFill(descs, P);
  assert.equal(descs[0].options[optOf(a, 0)].text, '2005年');
  assert.equal(descs[1].options[optOf(a, 1)].value, '06');
  assert.equal(descs[2].options[optOf(a, 2)].text, '14日');
});
test('planFill: 生年月日・卒業年月の1欄入力', () => {
  const a = M.planFill([
    D({ label: '生年月日', type: 'date' }), D({ label: '誕生日', placeholder: '例）20000101' }),
    D({ label: '生年月日（西暦）', placeholder: '2000/01/01' }),
    D({ label: '卒業予定年月', type: 'month' }), sel({ label: '卒業予定' }, ['選択してください', '2027年3月卒業見込み', '2028年3月卒業見込み', '2029年3月卒業見込み']),
  ], P);
  assert.equal(textOf(a, 0), '2005-06-14');
  assert.equal(textOf(a, 1), '20050614');
  assert.equal(textOf(a, 2), '2005/06/14');
  assert.equal(textOf(a, 3), '2028-03');
  assert.equal(optOf(a, 4), 2);
});
test('planFill: 卒業予定 年・月 の select', () => {
  const descs = [
    sel({ label: '卒業予定年月', after: '年' }, ['-', '2026', '2027', '2028', '2029']),
    sel({ label: '卒業予定年月', after: '月' }, ['-'].concat(Array.from({ length: 12 }, (_, i) => String(i + 1)))),
  ];
  const a = M.planFill(descs, P);
  assert.equal(descs[0].options[optOf(a, 0)].text, '2028');
  assert.equal(descs[1].options[optOf(a, 1)].text, '3');
});

// ---------- select の一致 ----------
test('matchOption: 都道府県（「愛知県」/「愛知」どちらの書き方でも）', () => {
  const full = [{ text: '選択してください', value: '' }].concat(M.PREFECTURES.map((p, i) => ({ text: p, value: String(i + 1) })));
  const shortList = [{ text: '---', value: '' }].concat(M.PREFECTURES.map((p) => ({ text: p === '北海道' ? p : p.replace(/[都府県]$/, ''), value: p })));
  const pref = (list, v) => list[M.matchOption(list, M.valueFor('prefecture', null, { tag: 'select' }, { prefecture: v }, {}))].text;
  assert.equal(pref(full, '愛知県'), '愛知県');
  assert.equal(pref(shortList, '愛知県'), '愛知');
  assert.equal(pref(shortList, '東京都'), '東京');
  assert.equal(pref(shortList, '京都府'), '京都');
  assert.equal(pref(full, '北海道'), '北海道');
});
test('matchOption: 性別・文理・学校区分の言い換え', () => {
  const pick = (key, value, texts) => {
    const d = sel({}, ['選択してください'].concat(texts));
    const i = M.matchOption(d.options, M.valueFor(key, null, d, { [key]: value }, {}));
    return i >= 0 ? d.options[i].text : null;
  };
  assert.equal(pick('gender', '男性', ['男', '女']), '男');
  assert.equal(pick('gender', '女性', ['男性', '女性', 'その他']), '女性');
  assert.equal(pick('bunri', '文系', ['理系', '文系']), '文系');
  assert.equal(pick('bunri', '理系', ['文科系', '理科系']), '理科系');
  assert.equal(pick('schoolType', '大学', ['大学院（修士課程）', '大学（学部）', '短期大学']), '大学（学部）');
  assert.equal(pick('schoolType', '大学', ['大学院', '大学', '短期大学']), '大学');
  assert.equal(pick('schoolType', '短期大学', ['大学', '短大', '高専']), '短大');
});
test('matchOption: 数値の一致（"04" と "4月"、和暦併記）・一致しなければ -1', () => {
  const months = [{ text: '--', value: '' }].concat(Array.from({ length: 12 }, (_, i) => ({ text: (i + 1) + '月', value: String(i + 1).padStart(2, '0') })));
  assert.equal(months[M.matchOption(months, { texts: ['4'], num: 4 })].text, '4月');
  const years = [{ text: '選択', value: '' }, { text: '2004年（平成16年）', value: '2004' }, { text: '2005年（平成17年）', value: '2005' }];
  assert.equal(M.matchOption(years, { texts: ['2005'], num: 2005 }), 2);
  assert.equal(M.matchOption(years, { texts: ['1999'], num: 1999 }), -1);
  assert.equal(M.matchOption([{ text: '選択してください', value: '' }], { texts: ['愛知県'] }), -1);
});

// ---------- 全体 ----------
test('planFill: 試し用デモページと同じ構成で全欄が埋まる', () => {
  const months = ['--'].concat(Array.from({ length: 12 }, (_, i) => String(i + 1)));
  const descs = [
    D({ label: '氏名', near: '姓', name: 'sei' }), D({ label: '氏名', near: '名', name: 'mei' }),
    D({ label: 'フリガナ（半角カナ）', placeholder: 'ｾｲ' }), D({ label: 'フリガナ（半角カナ）', placeholder: 'ﾒｲ' }),
    D({ label: '氏名（ローマ字）', near: '姓', placeholder: '例）YAMADA' }), D({ label: '氏名（ローマ字）', near: '名', placeholder: '例）TARO' }),
    sel({ label: '生年月日', after: '年' }, ['--', '2004', '2005', '2006']), sel({ label: '生年月日', after: '月' }, months),
    sel({ label: '生年月日', after: '日' }, ['--'].concat(Array.from({ length: 31 }, (_, i) => String(i + 1)))),
    { tag: 'radio', type: 'radio', name: 'gender', label: '性別', options: [{ text: '男性', value: 'm' }, { text: '女性', value: 'f' }, { text: '回答しない', value: 'n' }] },
    D({ label: 'メールアドレス', type: 'email' }), D({ label: 'メールアドレス（確認用）', type: 'email' }),
    D({ label: '携帯電話番号', maxLength: 3 }), D({ label: '携帯電話番号', maxLength: 4 }), D({ label: '携帯電話番号', maxLength: 4 }),
    D({ label: '郵便番号', maxLength: 3 }), D({ label: '郵便番号', maxLength: 4 }),
    sel({ label: '都道府県' }, ['選択してください'].concat(M.PREFECTURES)),
    D({ label: '市区町村' }), D({ label: '番地' }), D({ label: '建物名・部屋番号' }),
    sel({ label: '学校区分' }, ['選択してください', '大学院', '大学', '短期大学']),
    D({ label: '大学名' }), D({ label: '学部名' }), D({ label: '学科名' }),
    { tag: 'radio', type: 'radio', name: 'bunri', label: '文理区分', options: [{ text: '文系', value: '1' }, { text: '理系', value: '2' }] },
    sel({ label: '卒業予定年月', after: '年' }, ['--', '2027', '2028']), sel({ label: '卒業予定年月', after: '月' }, months),
  ];
  const a = M.planFill(descs, P);
  assert.equal(a.length, descs.length, '全欄に入力する');
  const t = (i) => textOf(a, i), o = (i) => descs[i].options[optOf(a, i)].text;
  assert.deepEqual([t(0), t(1), t(2), t(3), t(4), t(5)], ['山田', '太郎', 'ﾔﾏﾀﾞ', 'ﾀﾛｳ', 'YAMADA', 'TARO']);
  assert.deepEqual([o(6), o(7), o(8), o(9)], ['2005', '6', '14', '男性']);
  assert.deepEqual([t(10), t(11)], ['taro.yamada@example.com', 'taro.yamada@example.com']);
  assert.deepEqual([t(12), t(13), t(14), t(15), t(16)], ['090', '0123', '4567', '450', '0002']);
  assert.deepEqual([o(17), t(18), t(19), t(20), o(21)], ['愛知県', '名古屋市中村区', '名駅9丁目9-99', 'サンプルハイツ101', '大学']);
  assert.deepEqual([t(22), t(23), t(24), o(25), o(26), o(27)], ['サンプル大学', '経済学部', '経済学科', '文系', '2028', '3']);
});
test('planFill: 氏名・フリガナが1欄ずつのとき（全角カナは全角空白でつなぐ）', () => {
  const a = M.planFill([D({ label: '氏名' }), D({ label: 'フリガナ' }), D({ label: 'フリガナ（半角）' }), D({ label: 'ふりがな' }), D({ label: '氏名（ローマ字）' })], P);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => textOf(a, i)), ['山田　太郎', 'ヤマダ　タロウ', 'ﾔﾏﾀﾞ ﾀﾛｳ', 'やまだ　たろう', 'Yamada Taro']);
});
test('planFill: 「氏名」行に欄が2つ（小見出しなし）なら姓・名に分ける', () => {
  const a = M.planFill([D({ label: '氏名', placeholder: '例）山田' }), D({ label: '氏名', placeholder: '例）太郎' })], P);
  assert.deepEqual([textOf(a, 0), textOf(a, 1)], ['山田', '太郎']);
});
test('planFill: 既に値が入っている欄は上書きしない', () => {
  const descs = [
    D({ label: '姓', value: '佐藤' }), D({ label: '名' }),
    sel({ label: '都道府県', selectedIndex: 3 }, ['選択してください', '北海道', '青森県', '岩手県']),
    { tag: 'radio', label: '性別', options: [{ text: '男性', value: 'm' }, { text: '女性', value: 'f', checked: true }] },
    sel({ label: '学校区分' }, ['選択してください', '大学']),
  ];
  const a = M.planFill(descs, P);
  assert.deepEqual(a.map((x) => x.index), [1, 4]);
});
test('planFill: 住所の欄構成に合わせてつなぐ（建物名の欄が無ければ番地に足す・1欄住所・全角指定）', () => {
  let a = M.planFill([D({ label: '番地' })], P);
  assert.equal(textOf(a, 0), '名駅9丁目9-99 サンプルハイツ101');
  a = M.planFill([D({ label: '住所' })], P);
  assert.equal(textOf(a, 0), '愛知県名古屋市中村区名駅9丁目9-99 サンプルハイツ101');
  a = M.planFill([sel({ label: '都道府県' }, ['選択'].concat(M.PREFECTURES)), D({ label: '住所' })], P);
  assert.equal(textOf(a, 1), '名古屋市中村区名駅9丁目9-99 サンプルハイツ101');
  a = M.planFill([D({ label: '番地（全角）' }), D({ label: '建物名' })], P);
  assert.equal(textOf(a, 0), '名駅９丁目９－９９');
});
test('planFill: プロフィールが空の項目は入れない', () => {
  const a = M.planFill([D({ label: '姓' }), D({ label: 'メールアドレス' })], { lastName: '山田' });
  assert.deepEqual(a.map((x) => x.index), [0]);
});
