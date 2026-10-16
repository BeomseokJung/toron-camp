#!/usr/bin/env node
/*
 * 명품 의견 검토판 — 학급 서버 (설치할 패키지 없음, Node.js 16 이상)
 *   실행:  node server.js            (기본 포트 8080)
 *   옵션:  PORT=9000 TEACHER_PIN=1234 node server.js
 * 같은 와이파이에 연결된 학생 태블릿에서  http://<이 컴퓨터 IP>:8080  으로 접속합니다.
 * 데이터는 server/data/discussion-data.json 에 저장됩니다.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'discussion-data.json');
const CONF_FILE = path.join(DATA_DIR, 'config.json');
const PUBLIC_FILE = path.join(ROOT, 'public', 'index.html');
const PORT = parseInt(process.env.PORT || '8080', 10);

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- 설정 & 교사 PIN ---------- */
let conf = {};
try { conf = JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')); } catch (e) { conf = {}; }
if (process.env.TEACHER_PIN) conf.pin = String(process.env.TEACHER_PIN);
if (!conf.pin) conf.pin = String(crypto.randomInt(1000, 10000));
fs.writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2));

/* ---------- 데이터 ---------- */
const EMPTY = () => ({ settings: null, groups: {}, reviews: {}, selfevals: {}, obs: {} });
let db = EMPTY();
try { db = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch (e) { /* 새로 시작 */ }

let writing = false, dirty = false;
function persist() {
  if (writing) { dirty = true; return; }
  writing = true;
  const tmp = DATA_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(db), (err) => {
    if (!err) fs.renameSync(tmp, DATA_FILE);
    else console.error('저장 실패:', err.message);
    writing = false;
    if (dirty) { dirty = false; persist(); }
  });
}

/* ---------- 도우미 ---------- */
const ID_RE = /^[A-Za-z0-9_.\-]{1,60}$/;
function send(res, code, obj, headers) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, headers || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 512 * 1024) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function pinOk(req, url) {
  let p = req.headers['x-teacher-pin'] || url.searchParams.get('pin') || '';
  try { p = decodeURIComponent(p); } catch (e) {}
  const a = Buffer.from(String(p)), b = Buffer.from(conf.pin);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function exportCsv() {
  const MARK = { 2: '○', 1: '△', 0: '×' };
  const rows = [];
  rows.push(['구분', '모둠', '이름', '내용', '근거/까닭', '점수', '기타']);
  Object.values(db.groups).sort((a, b) => a.no - b.no).forEach((g) => {
    (g.opinions || []).forEach((o) => {
      let t = 0, m = 0; (g.criteria || []).forEach((c) => { const v = o.scores[c.id]; if (v != null) t += v; m += 2; });
      rows.push(['의견', g.no + '모둠', o.author, o.text, o.reason, t + '/' + m, '좋은 점: ' + (o.good || '') + ' / 생각해 볼 점: ' + (o.think || '')]);
    });
    if (g.best && g.best.text) rows.push(['명품 의견', g.no + '모둠', '', g.best.text, g.best.reason, '', '기준: ' + (g.criteria || []).map((c) => c.text).join(' / ')]);
  });
  Object.values(db.reviews).forEach((r) => {
    let t = 0, m = 0; (r.criteria || []).forEach((c) => { if (r.scores[c] != null) t += r.scores[c]; m += 2; });
    rows.push(['상호 검토', (db.groups[r.from] ? db.groups[r.from].no : r.from) + '모둠→' + (db.groups[r.to] ? db.groups[r.to].no : r.to) + '모둠', r.reviewer, r.praise, r.suggest, t + '/' + m, '']);
  });
  Object.values(db.selfevals).sort((a, b) => a.no - b.no).forEach((s) => {
    const o = db.obs[s.id] || {};
    rows.push(['자기 평가', s.group + '모둠', s.no + '번 ' + s.name, (s.items || []).map((v) => (v == null ? '-' : MARK[v])).join(' '), s.effort, '', '새로 안 점: ' + (s.learned || '') + ' / 관찰평가: ' + (o.grade || '')]);
  });
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/* ---------- 라우터 ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(PUBLIC_FILE).pipe(res);
    }
    if (p === '/api/ping') return send(res, 200, { ok: true });
    if (req.method === 'GET' && p === '/api/public') return send(res, 200, { settings: db.settings, groups: db.groups, reviews: db.reviews });

    let m = p.match(/^\/api\/(groups|reviews|selfevals)\/([^/]+)$/);
    if (m && req.method === 'PUT') {
      const id = decodeURIComponent(m[2]);
      if (!ID_RE.test(id)) return send(res, 400, { error: 'bad id' });
      const body = await readBody(req);
      if (!body || typeof body !== 'object') return send(res, 400, { error: 'bad body' });
      body.id = id; body.serverAt = new Date().toISOString();
      db[m[1]][id] = body; persist();
      return send(res, 200, { ok: true });
    }

    if (p.indexOf('/api/admin/') === 0) {
      if (!pinOk(req, url)) return send(res, 401, { error: 'pin' });
      if (req.method === 'GET' && p === '/api/admin/all') return send(res, 200, db);
      if (req.method === 'GET' && p === '/api/admin/export.csv') {
        return send(res, 200, exportCsv(), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent('토의결과.csv') });
      }
      if (req.method === 'PUT' && p === '/api/admin/settings') { db.settings = await readBody(req); persist(); return send(res, 200, { ok: true }); }
      m = p.match(/^\/api\/admin\/obs\/([^/]+)$/);
      if (m && req.method === 'PUT') { const id = decodeURIComponent(m[1]); if (!ID_RE.test(id)) return send(res, 400, { error: 'bad id' }); const b = await readBody(req); b.id = id; db.obs[id] = b; persist(); return send(res, 200, { ok: true }); }
      if (req.method === 'POST' && p === '/api/admin/reset') {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(DATA_DIR, 'backup-' + stamp + '.json'), JSON.stringify(db));
        const s = db.settings; db = EMPTY(); db.settings = s; persist();
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  Object.values(os.networkInterfaces()).forEach((list) => (list || []).forEach((i) => { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); }));
  console.log('\n  명품 의견 검토판 서버가 켜졌어요.\n');
  console.log('  학생 태블릿 접속 주소:');
  (ips.length ? ips : ['localhost']).forEach((ip) => console.log('     http://' + ip + ':' + PORT));
  console.log('\n  교사 비밀번호(PIN): ' + conf.pin + '   (바꾸려면 data/config.json 수정 후 다시 실행)');
  console.log('  끄려면 이 창에서 Ctrl + C\n');
});
