/* Shared by the isolated content script, service worker and contract tests. */
(function (root) {
  'use strict';
  function allowed(url) {
    try {
      const location = new URL(url);
      if (location.username || location.password) return false;
      const practice = location.pathname === '/neis-practice';
      return (location.protocol === 'https:' && (location.hostname.endsWith('.neis.go.kr') ||
        (location.hostname === 'nicehelperys.vercel.app' && practice))) ||
        (location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname) && practice);
    } catch { return false; }
  }
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
  function parseJob(raw, now = Date.now()) {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 1000000) throw new Error('1MB 이하의 작업 JSON 파일을 선택하세요.');
    let job;
    try { job = JSON.parse(raw); } catch { throw new Error('작업 파일을 읽지 못했습니다. JSON 형식을 확인하세요.'); }
    if (!record(job) || job.format !== 'damim-neis-job' || job.version !== 1 || job.task !== 'behavior-opinion') throw new Error('담임노트 행동특성 작업 파일이 아닙니다.');
    const time = typeof job.createdAt === 'string' ? Date.parse(job.createdAt) : NaN;
    if (!Number.isFinite(time) || time > now + 300000 || now - time > 86400000) throw new Error('작업 파일은 생성 후 24시간 동안 사용합니다. 최신 기록으로 다시 내려받으세요.');
    const c = job.classroom;
    if (!record(c) || !Number.isInteger(c.year) || c.year < 2000 || c.year > 2100 || !Number.isInteger(c.grade) || c.grade < 1 || c.grade > 6 || !text(c.room, 20) || /[\r\n\t]/.test(c.room) || ![1, 2].includes(c.semester)) throw new Error('학급 정보가 올바르지 않습니다.');
    if (!Array.isArray(job.rows) || job.rows.length < 1 || job.rows.length > 500) throw new Error('1~500명의 작업 파일을 선택하세요.');
    const numbers = new Set();
    const rows = job.rows.map(row => {
      if (!record(row) || !Number.isInteger(row.number) || row.number < 1 || row.number > 999 || numbers.has(row.number) || !text(row.name, 100) || /[\r\n\t]/.test(row.name) || !text(row.content, 6000)) throw new Error('학생 번호·이름·문장 또는 중복을 확인하세요.');
      numbers.add(row.number);
      return { number: row.number, name: row.name.trim(), content: row.content.replace(/\r\n?/g, '\n') };
    });
    return { format: job.format, version: 1, task: job.task, createdAt: job.createdAt, classroom: { year: c.year, grade: c.grade, room: c.room.trim(), semester: c.semester }, rows };
  }
  function normalize(value) { return String(value).normalize('NFC').trim(); }
  function matches(kind, actual, expected) {
    const value = normalize(actual);
    const suffix = { year: '학년도', grade: '학년', room: '반', semester: '학기', number: '번' }[kind];
    if (kind === 'name') return value === normalize(expected);
    const raw = suffix && value.endsWith(suffix) ? value.slice(0, -suffix.length).trim() : value;
    if (kind === 'room') return raw === normalize(expected);
    return /^\d+$/.test(raw) && Number(raw) === expected;
  }
  const api = Object.freeze({ allowed, parseJob, matches });
  root.DamimNeis = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
