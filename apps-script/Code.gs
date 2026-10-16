/**
 * 명품 의견 검토판 — Google Apps Script 서버
 *
 * 1) 새 구글 시트를 만들고  [확장 프로그램] → [Apps Script] 를 엽니다.
 * 2) 이 파일 내용을 Code.gs 에 붙여 넣고, [+] → [HTML] 로 "Index" 파일을 만들어 Index.html 내용을 붙여 넣습니다.
 * 3) 아래 TEACHER_PIN 을 원하는 숫자로 바꾸고 저장합니다.
 * 4) [배포] → [새 배포] → 유형: 웹 앱 / 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포
 *    (처음 한 번 권한 승인 창이 뜹니다.) 나온 웹 앱 URL 을 학생들에게 안내하면 끝!
 * 학생은 구글 로그인 없이 접속할 수 있고, 모든 기록은 이 시트의 탭에 쌓입니다.
 */
var TEACHER_PIN = '1234'; // 실제 서버의 비밀번호는 Apps Script 편집기에서만 바꿔요

var SHEETS = {
  settings:  ['id', '저장 시각', 'JSON'],
  groups:    ['id', '저장 시각', '모둠', '모둠원', '검토 기준', '명품 의견', '제출', 'JSON'],
  reviews:   ['id', '저장 시각', '검토한 모둠', '검토받은 모둠', '검토자', '칭찬', '제안', 'JSON'],
  selfevals: ['id', '저장 시각', '번호', '이름', '모둠', '문항1', '문항2', '문항3', '문항4', '문항5', '노력할 점', '새로 안 점', 'JSON'],
  obs:       ['id', '저장 시각', '관찰평가', 'JSON']
};
var MARK = { 2: '○', 1: '△', 0: '×' };

function doGet() {
  var api = ScriptApp.getService().getUrl();
  var link = 'https://toron-camp.vercel.app/review/?api=' + encodeURIComponent(api);
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;padding:24px;line-height:1.6"><h2>토의 캠프 데이터 서버</h2><p>이 주소는 명품 의견 검토판이 쓰는 저장 서버예요.</p><p><a href="' + link + '" target="_top">명품 의견 검토판 열기</a></p></div>').setTitle('토의 캠프 데이터 서버');
}

/* GitHub Pages 등 다른 주소에 올린 화면이 부르는 JSON API (POST, text/plain) */
var API_FNS = { apiLoadPublic: apiLoadPublic, apiLoadAdmin: apiLoadAdmin, apiSaveGroup: apiSaveGroup, apiAddReview: apiAddReview,
  apiSaveSelf: apiSaveSelf, apiSaveSettings: apiSaveSettings, apiSaveObs: apiSaveObs, apiReset: apiReset };
function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var fn = API_FNS[req.fn];
    if (!fn) throw new Error('unknown fn');
    out = fn.apply(null, req.args || []);
  } catch (err) {
    out = JSON.stringify({ error: String(err && err.message || err) });
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 시트 도우미 ---------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) {
    s = ss_().insertSheet(name);
    s.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold').setBackground('#DCEAE0');
    s.setFrozenRows(1);
  }
  return s;
}
function readAll_(name) {
  var s = sheet_(name), n = s.getLastRow(), out = {};
  if (n < 2) return out;
  var w = SHEETS[name].length;
  var rows = s.getRange(2, 1, n - 1, w).getValues();
  rows.forEach(function (r) { if (r[0]) { try { out[r[0]] = JSON.parse(r[w - 1]); } catch (e) {} } });
  return out;
}
function upsert_(name, id, obj, cols) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = sheet_(name), n = s.getLastRow(), row = -1;
    if (n >= 2) {
      var ids = s.getRange(2, 1, n - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) { row = i + 2; break; }
    }
    var values = [id, new Date()].concat(cols || []).concat([JSON.stringify(obj)]);
    if (row < 0) s.appendRow(values); else s.getRange(row, 1, 1, values.length).setValues([values]);
  } finally { lock.releaseLock(); }
}
function checkPin_(pin) { if (String(pin) !== String(TEACHER_PIN)) throw new Error('PIN이 맞지 않아요.'); }
function safeId_(id) { id = String(id || ''); if (!/^[A-Za-z0-9_.\-]{1,60}$/.test(id)) throw new Error('bad id'); return id; }

/* ---------- 학생/교사가 호출하는 함수 ---------- */
function apiLoadPublic() {
  var st = readAll_('settings');
  return JSON.stringify({ settings: st.main || null, groups: readAll_('groups'), reviews: readAll_('reviews') });
}
function apiLoadAdmin(pin) {
  checkPin_(pin);
  var st = readAll_('settings');
  return JSON.stringify({ settings: st.main || null, groups: readAll_('groups'), reviews: readAll_('reviews'), selfevals: readAll_('selfevals'), obs: readAll_('obs'), url: ScriptApp.getService().getUrl() });
}
function apiSaveGroup(json) {
  var g = JSON.parse(json), id = safeId_(g.id);
  var crit = (g.criteria || []).map(function (c) { return c.text; }).join(' / ');
  upsert_('groups', id, g, [g.no + '모둠' + (g.name ? ' ' + g.name : ''), (g.members || []).filter(String).join(', '), crit, (g.best && g.best.text) || '', g.submitted ? '제출' : '작성 중']);
  return JSON.stringify({ ok: true });
}
function apiAddReview(json) {
  var r = JSON.parse(json), id = safeId_(r.id);
  upsert_('reviews', id, r, [r.from, r.to, r.reviewer, r.praise || '', r.suggest || '']);
  return JSON.stringify({ ok: true });
}
function apiSaveSelf(json) {
  var s = JSON.parse(json), id = safeId_(s.id);
  var items = (s.items || []).map(function (v) { return v == null ? '' : MARK[v]; });
  upsert_('selfevals', id, s, [s.no, s.name, s.group].concat(items).concat([s.effort || '', s.learned || '']));
  return JSON.stringify({ ok: true });
}
function apiSaveSettings(pin, json) { checkPin_(pin); upsert_('settings', 'main', JSON.parse(json), []); return JSON.stringify({ ok: true }); }
function apiSaveObs(pin, json) { checkPin_(pin); var o = JSON.parse(json); upsert_('obs', safeId_(o.id), o, [o.grade || '']); return JSON.stringify({ ok: true }); }
function apiReset(pin) {
  checkPin_(pin);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMdd-HHmm');
  ['groups', 'reviews', 'selfevals', 'obs'].forEach(function (name) {
    var s = sheet_(name);
    s.copyTo(ss_()).setName('백업-' + name + '-' + stamp);
    if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, SHEETS[name].length).clearContent();
  });
  return JSON.stringify({ ok: true });
}

/** 처음 한 번 편집기에서 실행하면 탭을 미리 만들어 둡니다(선택). */
function setup() { Object.keys(SHEETS).forEach(sheet_); }
