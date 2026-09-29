(function () {
  'use strict';
  const core = globalThis.DamimNeis;
  if (!core || !core.allowed(location.href)) return;
  if (globalThis.__damimHelperClose) { globalThis.__damimHelperClose(); return; }
  const practice = core.practice(location.href);
  const webPractice = practice && document.currentScript?.dataset.damimMode === 'web-practice';
  const host = document.createElement('div');
  host.id = 'damim-neis-helper';
  host.style.cssText = 'position:fixed;top:12px;right:12px;width:360px;max-width:calc(100vw - 24px);z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'open' });
  // Static markup only. Imported text is always rendered using textContent/value.
  shadow.innerHTML = `<style>
    :host{all:initial;color:#192c46;font:14px/1.55 system-ui,sans-serif}*{box-sizing:border-box}
    section{background:#fff;border:2px solid #3555e8;border-radius:14px;box-shadow:0 12px 40px #0003;padding:16px;max-height:calc(100vh - 24px);overflow:auto}
    h2{font-size:18px;margin:0}p{margin:8px 0}.muted{color:#536781;font-size:12px}button,input,select{font:inherit}button{cursor:pointer;background:#eef2ff;border:1px solid #b7c6ff;border-radius:7px;padding:8px;color:#203e86}button:disabled{cursor:not-allowed;opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #f5a623;outline-offset:2px}button.primary{background:#3555e8;color:white;width:100%;margin-top:8px}.row{display:flex;gap:8px;align-items:center;justify-content:space-between}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}input,select{max-width:100%;width:100%;margin:5px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto;background:#f5f7fb;padding:8px;font:inherit}.status{padding:10px;background:#edf2ff;border-radius:8px;overflow-wrap:anywhere}.status.error{background:#fff0ed;color:#a12c15}.hidden{display:none}label{display:block}#close{padding:4px 8px}#cancel{width:100%}
    #mapping-values{padding-left:18px;overflow-wrap:anywhere}summary{cursor:pointer}
  </style><section aria-label="담임노트 입력 도우미">
    <div class="row"><h2>담임노트 입력 도우미</h2><button id="close" aria-label="도우미 닫기">닫기</button></div>
    <p class="muted">0.5.0 · ${webPractice ? '웹 연습' : '확장프로그램'} · 실제 나이스 호환성 미검증. 가상 자료만 사용하세요. 저장 버튼은 누르지 않으며 사이트의 입력 이벤트가 자동 저장을 실행할 수 있습니다.</p>
    <label>작업 JSON 파일<input id="file" type="file" accept=".json,application/json"></label>
    <p id="classroom"></p><label>작업 학생<select id="student" disabled></select></label><pre id="preview"></pre>
    <p class="muted">각 ‘지정’ 버튼을 누른 뒤 화면에서 해당 값만 보이는 항목을 클릭하세요. 문장 입력칸도 따로 지정합니다. iframe·캔버스는 지원하지 않습니다.</p>
    ${practice ? '<button id="practice-map" class="primary">연습 화면 항목 자동 지정</button><p class="muted">이 가상 연습 화면에서만 사용합니다. 자동 지정 후에도 화면 대조를 거쳐야 입력할 수 있습니다.</p>' : ''}
    <div id="mapping" class="grid"></div><button id="cancel" class="hidden">지정 취소 (Esc)</button>
    <details><summary>지정한 값 확인</summary><ul id="mapping-values" aria-label="지정한 값" class="muted"></ul></details>
    <button id="inspect" class="primary" disabled>화면 대조</button><button id="fill" class="primary" disabled>대조한 빈칸에 입력</button>
    <p id="status" class="status" role="status" aria-live="polite">작업 파일을 열어 주세요. 화면의 기존 문장은 덮어쓰지 않습니다.</p>
    <p class="muted">문장·학급 수정 후 새 파일을 만드세요. 파일은 24시간 후 만료됩니다. 닫기·새로고침 시 도우미 자료와 지정이 사라집니다.</p>
  </section>`;
  document.documentElement.append(host);
  const $ = id => shadow.getElementById(id);
  const kinds = { year: '학년도', grade: '학년', room: '반', semester: '학기', number: '학생 번호', name: '학생 이름', field: '문장 입력칸' };
  let job = null, selected = 0, picking = null, prepared = null, revision = 0, closed = false, busy = false;
  const targets = {};
  const initialUrl = location.href;
  function say(message, error = false) { $('status').textContent = message; $('status').className = `status${error ? ' error' : ''}`; }
  function invalidate() { prepared = null; $('fill').disabled = true; }
  function cancel() { picking = null; $('cancel').className = 'hidden'; }
  function readable(element) {
    if (!element?.isConnected || element.getRootNode() !== document || !element.getClientRects().length || getComputedStyle(element).visibility !== 'visible' || getComputedStyle(element).display === 'none') throw new Error('지정한 항목이 바뀌거나 보이지 않습니다. 다시 지정하세요.');
    if (element instanceof HTMLInputElement && ['password', 'hidden'].includes(element.type)) throw new Error('이 항목은 읽을 수 없습니다.');
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element.value : element.textContent.trim();
  }
  const short = value => String(value).replace(/\s+/g, ' ').slice(0, 100);
  function expected(kind) { return !job ? '작업 파일 선택 전' : kind === 'number' || kind === 'name' ? job.rows[selected][kind] : job.classroom[kind]; }
  function renderMappings() {
    $('mapping-values').replaceChildren();
    for (const [kind, label] of Object.entries(kinds)) {
      const button = shadow.querySelector(`[data-kind="${kind}"]`);
      button.textContent = `${label} ${targets[kind] ? '다시 지정 ✓' : '지정'}`;
      let actual = '미지정';
      if (targets[kind]) {
        try { const value = readable(targets[kind]); actual = kind === 'field' ? '입력칸 지정됨' : short(value); }
        catch { actual = '항목이 바뀌었거나 보이지 않음'; }
      }
      const line = document.createElement('li');
      line.textContent = `${label}: ${actual}${kind === 'field' ? '' : ` / 작업 파일: ${short(expected(kind))}`}`;
      $('mapping-values').append(line);
    }
  }
  function check() {
    if (!job || closed || location.href !== initialUrl || !core.allowed(location.href)) throw new Error('화면 또는 작업이 바뀌었습니다. 도우미를 닫고 다시 여세요.');
    core.parseJob(JSON.stringify(job)); // Expiry is rechecked immediately before each write.
    const row = job.rows[selected];
    const values = {};
    const field = targets.field;
    if (!(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLInputElement && field.type === 'text')) throw new Error('일반 문장 입력칸을 지정하세요. 전용 편집기·iframe은 지원하지 않습니다.');
    const before = readable(field);
    if (field.disabled || field.readOnly || field.matches(':disabled')) throw new Error('수정할 수 없는 입력칸입니다.');
    const editor = field.closest('form,[role="dialog"],[data-damim-record]');
    if (!editor || !editor.contains(targets.number) || !editor.contains(targets.name)) throw new Error('학생 번호·이름과 문장 입력칸이 같은 편집 영역에 있어야 합니다. 목록의 다른 학생을 지정하지 마세요.');
    const writable = [...editor.querySelectorAll('textarea,input[type="text"]')].filter(element => !element.disabled && !element.readOnly && element.getClientRects().length);
    if (writable.length !== 1 || writable[0] !== field) throw new Error('이 편집 영역의 입력칸이 여러 개여서 구분할 수 없습니다. 학생별 편집 화면에서 다시 지정하세요.');
    const label = [field.getAttribute('aria-label') || '', ...[...(field.labels || [])].map(element => element.textContent)].join('');
    if (!/행동특성\s*(?:및\s*)?종합의견/.test(label.replace(/\s+/g, ''))) throw new Error('행동특성 및 종합의견으로 표시된 입력칸만 지원합니다. 화면별 연결 검증이 필요합니다.');
    if (field instanceof HTMLInputElement && /[\r\n]/.test(row.content)) throw new Error('여러 줄 문장에는 여러 줄 입력칸을 지정하세요.');
    if (field.maxLength >= 0 && row.content.length > field.maxLength) throw new Error('문장이 이 입력칸의 최대 길이를 초과합니다.');
    for (const kind of Object.keys(kinds).filter(key => key !== 'field')) {
      const element = targets[kind];
      if (!element || element === field || element.contains(field) || field.contains(element)) throw new Error(`${kinds[kind]} 항목을 문장 입력칸과 별도로 지정하세요.`);
      values[kind] = readable(element);
      if (!core.matches(kind, values[kind], expected(kind))) throw new Error(`${kinds[kind]} 값이 작업 파일과 다릅니다. 선택한 값: 「${short(values[kind])}」 / 작업 파일: 「${short(expected(kind))}」. 해당 항목을 다시 지정하세요.`);
    }
    if (before !== '' && before !== row.content) throw new Error('기존 문장이 있어 입력을 중단했습니다. 덮어쓰지 않습니다.');
    return { values, before, row, field, selected, revision };
  }
  for (const [kind, label] of Object.entries(kinds)) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `${label} 지정`; button.dataset.kind = kind;
    button.addEventListener('click', () => { if (busy) return; invalidate(); delete targets[kind]; renderMappings(); picking = kind; $('cancel').className = ''; say(`화면에서 ${label} 항목을 클릭하세요. 취소는 Esc입니다.`); });
    $('mapping').append(button);
  }
  function choose(event) {
    if (!picking || event.composedPath().includes(host)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const element = event.target;
    try {
      if (!(element instanceof HTMLElement) || ['IFRAME', 'CANVAS', 'BODY', 'HTML'].includes(element.tagName)) throw new Error('값이 표시된 개별 항목을 선택하세요. 이 화면 요소는 지원하지 않습니다.');
      readable(element);
      if (picking === 'field' && !(element instanceof HTMLTextAreaElement) && !(element instanceof HTMLInputElement && element.type === 'text')) throw new Error('일반 텍스트 입력칸을 선택하세요.');
      targets[picking] = element;
      renderMappings();
      cancel(); invalidate(); say('항목을 지정했습니다. 모든 항목을 지정한 뒤 화면 대조를 누르세요.');
    } catch (error) { say(error.message, true); }
  }
  function key(event) { if (event.key === 'Escape' && picking) { event.preventDefault(); cancel(); say('지정을 취소했습니다.'); } }
  document.addEventListener('click', choose, true);
  document.addEventListener('keydown', key, true);
  document.addEventListener('visibilitychange', invalidate);
  renderMappings();
  if (practice) $('practice-map').onclick = () => {
    if (busy) return;
    cancel(); invalidate();
    for (const kind of Object.keys(kinds)) delete targets[kind];
    try {
      if (location.href !== initialUrl || !core.practice(location.href)) throw new Error('연습 화면이 바뀌었습니다. 다시 여세요.');
      const containers = document.querySelectorAll('main[data-damim-practice="1"]');
      if (containers.length !== 1) throw new Error('지원하는 연습 화면이 아닙니다. 최신 연습 페이지를 다시 여세요.');
      const next = {};
      for (const kind of Object.keys(kinds)) {
        const id = `practice-${kind === 'field' ? 'content' : kind}`;
        const elements = document.querySelectorAll(`[id="${id}"]`);
        if (elements.length !== 1 || !containers[0].contains(elements[0])) throw new Error('연습 항목을 정확히 찾지 못했습니다. 새로고침 후 다시 시도하세요.');
        readable(elements[0]); next[kind] = elements[0];
      }
      Object.assign(targets, next);
      say('연습 화면의 일곱 항목을 지정했습니다. 작업 파일을 확인한 뒤 화면 대조를 누르세요.');
    } catch (error) { say(error.message, true); }
    renderMappings();
  };
  $('cancel').onclick = () => { cancel(); say('지정을 취소했습니다.'); };
  $('student').onchange = () => { selected = Number($('student').value); invalidate(); renderMappings(); $('preview').textContent = job.rows[selected].content; say('화면에서 같은 학생을 연 다음 다시 대조하세요.'); };
  $('file').onchange = async () => {
    const file = $('file').files[0]; $('file').value = '';
    const current = ++revision; job = null; invalidate(); cancel(); $('student').replaceChildren(); $('student').disabled = true; $('inspect').disabled = true; $('preview').textContent = ''; $('classroom').textContent = '';
    renderMappings();
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('1MB 이하의 작업 파일을 선택하세요.');
      const raw = await file.text(); if (closed || current !== revision) return;
      job = core.parseJob(raw); selected = 0;
      for (const [index, row] of job.rows.entries()) { const option = document.createElement('option'); option.value = String(index); option.textContent = `${row.number}번 ${row.name}`; $('student').append(option); }
      const c = job.classroom; $('classroom').textContent = `${c.year}학년도 ${c.grade}학년 ${c.room}반 ${c.semester}학기 · ${job.rows.length}명`;
      $('student').disabled = false; $('inspect').disabled = false; $('preview').textContent = job.rows[0].content;
      renderMappings();
      say('작업 파일을 읽었습니다. 학급·학생 정보와 입력칸을 지정하세요.');
    } catch (error) { if (!closed && current === revision) say(error.message, true); }
  };
  $('inspect').onclick = () => {
    cancel(); invalidate(); renderMappings();
    try { prepared = check(); if (prepared.before === prepared.row.content) { say('화면에 같은 문장이 있습니다. 나이스 저장 여부는 직접 확인하세요.'); return; } $('fill').disabled = false; say('학급·학생 정보가 일치하고 입력칸이 비어 있습니다. 선택한 칸이 행동특성 및 종합의견 칸인지 확인 후 입력하세요.'); }
    catch (error) { say(error.message, true); }
  };
  $('fill').onclick = async () => {
    if (busy || !prepared) return;
    const snapshot = prepared; invalidate();
    let attempted = false;
    try {
      const current = check();
      if (current.field !== snapshot.field || current.selected !== snapshot.selected || current.revision !== snapshot.revision || JSON.stringify(current.values) !== JSON.stringify(snapshot.values) || current.before !== snapshot.before) throw new Error('대조 후 화면이 바뀌었습니다. 다시 대조하세요.');
      busy = true; $('student').disabled = true; $('file').disabled = true; $('inspect').disabled = true;
      const field = current.field;
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      attempted = true;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, current.row.content);
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: current.row.content }));
      // Never click, submit, press Enter, blur, or invoke page-private APIs.
      await new Promise(resolve => setTimeout(resolve, 150));
      if (closed) return;
      const after = check();
      if (after.field !== field || after.before !== current.row.content || JSON.stringify(after.values) !== JSON.stringify(current.values)) throw new Error('입력 후 화면이 바뀌었거나 문장이 유지되지 않았습니다. 실제 화면을 확인하세요. 저장 성공으로 처리하지 않습니다.');
      say('입력칸의 문장 일치를 확인했습니다. 저장 여부는 미확인입니다. 나이스에서 검토·저장하고 다음 학생을 선택하세요.');
    } catch (error) { if (!closed) say(attempted ? `입력을 시도했지만 결과를 확인하지 못했습니다. 화면에 변경이 남아 있을 수 있으니 직접 확인하세요. ${error.message}` : error.message, true); }
    finally { busy = false; if (!closed) { $('student').disabled = !job; $('file').disabled = false; $('inspect').disabled = !job; } }
  };
  const close = () => { closed = true; ++revision; job = null; prepared = null; cancel(); document.removeEventListener('click', choose, true); document.removeEventListener('keydown', key, true); document.removeEventListener('visibilitychange', invalidate); host.remove(); delete globalThis.__damimHelperClose; };
  globalThis.__damimHelperClose = close; $('close').onclick = close;
})();
