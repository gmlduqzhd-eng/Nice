import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createDemoWorkspace } from '../src/lib/demo';
import { createNeisJob, getNeisCandidates } from '../src/lib/neis-job';
import { editObservation, updateDraft } from '../src/lib/domain';

const require = createRequire(import.meta.url);
const core = require('../extension/neis-helper/core.js');
const demo = () => createDemoWorkspace();
const readyId = 'student-7';
const clock = new Date('2026-09-29T10:00:00.000Z');
const raw = () => JSON.stringify(createNeisJob(demo(), [readyId], clock));

test('only reviewed, unconfirmed, issue-free students can enter an input job', () => {
  const data = demo(); const before = structuredClone(data);
  assert.deepEqual(getNeisCandidates(data).filter(item => item.ready).map(item => item.student.id), [readyId]);
  const job = createNeisJob(data, [readyId], clock);
  assert.equal(job.rows.length, 1); assert.equal(job.rows[0].number, 7);
  assert.deepEqual(data, before);
  assert.deepEqual(core.parseJob(JSON.stringify(job), clock.getTime()), job);
  for (const selection of [[], ['missing'], [readyId, readyId], ['student-1'], ['student-4'], ['student-6']]) assert.throws(() => createNeisJob(data, selection));
});

test('edited text or evidence makes an already selected student ineligible', () => {
  const data = demo(); const draft = data.drafts.find(item => item.studentId === readyId)!;
  const changed = updateDraft(data, draft.id, draft.content + ' 다시 작성함.', draft.evidenceIds);
  assert.throws(() => createNeisJob(changed, [readyId]));
  assert.throws(() => createNeisJob(editObservation(data, draft.evidenceIds[0], { content: '관찰 내용 수정' }), [readyId]));
});

test('multiple drafts for one student and invalid name controls cannot be exported', () => {
  const data = demo(); const draft = data.drafts.find(item => item.studentId === readyId)!;
  data.drafts.push({ ...draft, id: 'extra-draft' });
  assert.throws(() => createNeisJob(data, [readyId]));
  const named = demo(); named.students.find(item => item.id === readyId)!.name = '가상\n학생';
  assert.throws(() => createNeisJob(named, [readyId]));
});

test('extension accepts only the explicit destination origins and practice route', () => {
  for (const url of ['https://goe.neis.go.kr/page', 'https://nicehelperys.vercel.app/neis-practice', 'http://127.0.0.1:3001/neis-practice']) assert.equal(core.allowed(url), true, url);
  for (const url of ['https://evil-neis.go.kr', 'https://goe.neis.go.kr.evil.test', 'http://goe.neis.go.kr/page', 'https://example.test/neis-practice', 'https://nicehelperys.vercel.app/', 'https://user:pass@goe.neis.go.kr', 'file:///neis-practice']) assert.equal(core.allowed(url), false, url);
});

test('export refuses an oversized UTF-8 job even when each sentence is within its limit', () => {
  const data = demo(); data.students = []; data.observations = []; data.drafts = [];
  for (let i = 1; i <= 80; i++) {
    data.students.push({ id: `s${i}`, number: i, name: `가상학생${i}` });
    data.observations.push({ id: `o${i}`, studentId: `s${i}`, date: '2026-09-29', category: '관찰', content: '관찰 근거' });
    data.drafts.push({ id: `d${i}`, studentId: `s${i}`, content: '가'.repeat(5900) + i, evidenceIds: [`o${i}`], status: 'reviewed', updatedAt: clock.toISOString() });
  }
  assert.throws(() => createNeisJob(data, data.students.map(student => student.id)), /1MB/);
});

test('extension rejects stale, future, oversized and malformed job files', () => {
  assert.throws(() => core.parseJob(raw(), clock.getTime() + 86400001), /24시간/);
  assert.throws(() => core.parseJob(raw(), clock.getTime() - 300001), /24시간/);
  for (const value of ['{}', '[1]', 'null', 'not json', ' '.repeat(1000001)]) assert.throws(() => core.parseJob(value, clock.getTime()));
  const job = JSON.parse(raw());
  for (const changed of [{ ...job, task: 'attendance' }, { ...job, rows: [] }, { ...job, rows: [job.rows[0], job.rows[0]] }, { ...job, rows: [{ ...job.rows[0], content: 'a'.repeat(6001) }] }, { ...job, classroom: { ...job.classroom, year: 0 } }]) assert.throws(() => core.parseJob(JSON.stringify(changed), clock.getTime()));
});

test('extension drops unknown data and normalizes textarea line endings', () => {
  const job = JSON.parse(raw()); job.secret = 'must not be retained'; job.rows[0].content = '첫 줄\r\n둘째 줄';
  const parsed = core.parseJob(JSON.stringify(job), clock.getTime());
  assert.equal(parsed.secret, undefined); assert.equal(parsed.rows[0].content, '첫 줄\n둘째 줄');
});

test('identity comparison is exact, not substring or whole-page matching', () => {
  assert.equal(core.matches('number', '07번', 7), true);
  assert.equal(core.matches('number', '17번', 7), false);
  assert.equal(core.matches('name', '백아람 이름', '백아람'), false);
  assert.equal(core.matches('name', '백아람', '백아람'), true);
  assert.equal(core.matches('year', '2026학년도', 2026), true);
  assert.equal(core.matches('room', '2반', '2'), true);
  assert.equal(core.matches('room', '12반', '2'), false);
});

test('automatic mapping is restricted to the exact fictional practice route', () => {
  for (const url of ['https://nicehelperys.vercel.app/neis-practice', 'http://localhost:3000/neis-practice', 'http://127.0.0.1:3001/neis-practice?test=1']) assert.equal(core.practice(url), true, url);
  for (const url of ['https://goe.neis.go.kr/neis-practice', 'https://nicehelperys.vercel.app/neis-practice/other', 'https://nicehelperys.vercel.app.evil.test/neis-practice', 'https://user:pass@nicehelperys.vercel.app/neis-practice', 'https://example.com/neis-practice', 'bad url']) assert.equal(core.practice(url), false, url);
});

test('extension declares only temporary tab injection permissions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/neis-helper/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
  for (const key of ['host_permissions', 'content_scripts', 'externally_connectable']) assert.equal(manifest[key], undefined);
});

test('service worker injects the packaged files only on supported pages', async () => {
  let onClick: (tab: { id: number; url: string }) => Promise<void> = async () => {};
  const calls: unknown[] = [];
  const badge: string[] = [];
  const titles: string[] = [];
  const defaultTitle = '담임노트 입력 도우미 열기';
  runInNewContext(readFileSync(new URL('../extension/neis-helper/background.js', import.meta.url), 'utf8'), { importScripts() {}, DamimNeis: core,
    chrome: { runtime: { getManifest() { return { action: { default_title: defaultTitle } }; } }, action: { onClicked: { addListener(callback: typeof onClick) { onClick = callback; } }, setBadgeText({ text }: { text: string }) { badge.push(text); }, setTitle({ title }: { title: string }) { titles.push(title); } }, scripting: { executeScript(value: unknown) { calls.push(JSON.parse(JSON.stringify(value))); } } } });
  await onClick({ id: 1, url: 'https://example.com' }); assert.equal(calls.length, 0); assert.equal(badge[0], '!');
  assert.match(titles[0], /지원하지 않습니다/);
  await onClick({ id: 1, url: 'https://nicehelperys.vercel.app/neis-practice' });
  assert.deepEqual(calls, [{ target: { tabId: 1 }, files: ['core.js', 'content.js'] }]);
  assert.equal(badge.at(-1), ''); assert.equal(titles.at(-1), defaultTitle);
});
