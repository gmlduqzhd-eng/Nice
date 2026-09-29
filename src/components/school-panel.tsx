"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Building2, CalendarDays, Check, MapPin, Search } from "lucide-react";

type School = { name: string; officeCode: string; schoolCode: string; address: string };
type SchoolEvent = { date: string; title: string; detail: string };
type ApiFailure = { error?: string; code?: string };
type Props = { onToast: (message: string) => void };
class NeisResponseError extends Error {}

function displayDate(value: string) {
  const normalized = value.replaceAll("-", "");
  return /^\d{8}$/.test(normalized) ? `${normalized.slice(0, 4)}.${normalized.slice(4, 6)}.${normalized.slice(6, 8)}` : value;
}

function fetchedTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "조회 시간 확인 불가" : parsed.toLocaleString("ko-KR");
}

function apiMessage(body: ApiFailure, status: number) {
  if (status === 503 && /KEY|CONFIG/i.test(body.code ?? "")) {
    return "나이스 API 인증키가 아직 설정되지 않았습니다. 현재 공개정보 연결을 준비 중입니다.";
  }
  return body.error || "나이스 공개정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function SchoolPanel({ onToast }: Props) {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [month, setMonth] = useState("");
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [schoolFetchedAt, setSchoolFetchedAt] = useState<string | null>(null);
  const [scheduleFetchedAt, setScheduleFetchedAt] = useState<string | null>(null);
  const [schoolsTruncated, setSchoolsTruncated] = useState(false);
  const [eventsTruncated, setEventsTruncated] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);
  const scheduleAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const now = new Date();
    setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    return () => {
      searchAbort.current?.abort();
      scheduleAbort.current?.abort();
    };
  }, []);

  function clearSchedule() {
    scheduleAbort.current?.abort();
    setScheduleBusy(false);
    setScheduleError("");
    setScheduleFetchedAt(null);
    setEventsTruncated(false);
    setEvents([]);
  }

  async function searchSchools(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) {
      setSearchError("학교 이름을 두 글자 이상 입력해 주세요.");
      return;
    }
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    clearSchedule();
    setSchool(null);
    setSchools([]);
    setSchoolFetchedAt(null);
    setSchoolsTruncated(false);
    setSearchError("");
    setSearchBusy(true);
    setSearchedQuery(term);
    try {
      const response = await fetch(`/api/neis?${new URLSearchParams({ type: "schools", q: term })}`, { signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new NeisResponseError(apiMessage(body, response.status));
      if (!Array.isArray(body.schools) || typeof body.fetchedAt !== "string") throw new NeisResponseError("학교 정보의 응답 형식을 확인하지 못했습니다.");
      setSchools(body.schools);
      setSchoolFetchedAt(body.fetchedAt);
      setSchoolsTruncated(body.truncated === true);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof NeisResponseError ? error.message : "학교 검색을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.";
      setSearchError(message);
      onToast(message);
    } finally {
      if (!controller.signal.aborted) setSearchBusy(false);
    }
  }

  async function fetchSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!school || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    scheduleAbort.current?.abort();
    const controller = new AbortController();
    scheduleAbort.current = controller;
    setScheduleBusy(true);
    setScheduleError("");
    setScheduleFetchedAt(null);
    setEventsTruncated(false);
    setEvents([]);
    try {
      const params = new URLSearchParams({ type: "schedule", office: school.officeCode, school: school.schoolCode, month: month.replace("-", "") });
      const response = await fetch(`/api/neis?${params}`, { signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new NeisResponseError(apiMessage(body, response.status));
      if (!Array.isArray(body.events) || typeof body.fetchedAt !== "string") throw new NeisResponseError("학사일정의 응답 형식을 확인하지 못했습니다.");
      setEvents(body.events);
      setScheduleFetchedAt(body.fetchedAt);
      setEventsTruncated(body.truncated === true);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof NeisResponseError ? error.message : "학사일정을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.";
      setScheduleError(message);
      onToast(message);
    } finally {
      if (!controller.signal.aborted) setScheduleBusy(false);
    }
  }

  return (
    <div className="stack school-panel">
      <div className="notice notice-block">
        <strong>나이스 교육정보 개방 포털의 공개정보를 조회합니다.</strong>
        <p>학교와 학사일정만 연결합니다. 학생부·출결을 직접 조회하거나 나이스에 입력하는 기능은 포함되지 않습니다.</p>
      </div>

      <section className="card stack" aria-labelledby="school-search-title">
        <div className="section-heading">
          <div><span className="badge"><Building2 size={14} aria-hidden="true" /> 공개정보</span><h2 id="school-search-title">우리 학교 찾기</h2></div>
          <a className="button secondary" href="https://open.neis.go.kr/portal/guide/apiGuidePage.do" target="_blank" rel="noreferrer">공식 API 안내 <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
        <p className="muted">학교 이름으로 검색하고 주소를 확인해 주세요. 같은 이름의 학교가 여러 곳일 수 있습니다.</p>
        <form className="row" onSubmit={searchSchools}>
          <label className="field" style={{ flex: 1, minWidth: "min(100%, 220px)" }} htmlFor="school-query">학교 이름<input id="school-query" className="input" placeholder="예: 서울가재울초등학교" type="search" minLength={2} maxLength={80} required value={query} onChange={event => setQuery(event.target.value)} /></label>
          <button type="submit" className="button primary" disabled={searchBusy} style={{ alignSelf: "end" }}><Search size={16} aria-hidden="true" /> {searchBusy ? "검색 중…" : "학교 검색"}</button>
        </form>
        {searchError && <p className="notice" role="alert">{searchError}</p>}
        {searchBusy && <p className="muted" role="status">나이스에서 학교 정보를 불러오고 있습니다…</p>}
        {schoolFetchedAt && (
          <div className="stack">
            <p className="muted">‘{searchedQuery}’ 검색 결과 {schools.length}개 · 조회 {fetchedTime(schoolFetchedAt)}</p>
            {schoolsTruncated && <p className="notice" role="status">검색 결과가 많아 일부 학교만 표시합니다. 학교 이름을 더 구체적으로 입력해 다시 검색해 주세요.</p>}
            {schools.length === 0 ? <div className="empty-state">일치하는 학교가 없습니다. 학교 이름을 짧게 입력해 다시 검색해 주세요.</div> : schools.map(item => {
              const selected = school?.schoolCode === item.schoolCode && school.officeCode === item.officeCode;
              return <button type="button" className={`button ${selected ? "primary" : "secondary"}`} style={{ justifyContent: "space-between", textAlign: "left", width: "100%", padding: "16px" }} key={`${item.officeCode}-${item.schoolCode}`} onClick={() => { clearSchedule(); setSchool(item); }} aria-pressed={selected}>
                <span><strong style={{ display: "block" }}>{item.name}</strong><span style={{ display: "block", marginTop: "6px", fontSize: "12px", fontWeight: 400 }}><MapPin size={12} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: "4px" }} />{item.address || "주소 정보 없음"}</span></span>
                {selected ? <Check size={18} aria-label="선택됨" /> : <span>선택</span>}
              </button>;
            })}
          </div>
        )}
        {!schoolFetchedAt && !searchError && !searchBusy && <div className="empty-state"><Building2 size={30} aria-hidden="true" /><p>학교를 검색하면 실제 공개정보가 여기에 표시됩니다.</p></div>}
      </section>

      <section className="card stack" aria-labelledby="school-schedule-title">
        <div className="section-heading"><div><span className="badge"><CalendarDays size={14} aria-hidden="true" /> 학사일정</span><h2 id="school-schedule-title">{school ? school.name : "학교의 한 달 일정"}</h2></div></div>
        {!school ? <div className="empty-state">위에서 학교를 선택하면 월별 학사일정을 조회할 수 있습니다.</div> : <>
          <form className="row" onSubmit={fetchSchedule}>
            <label className="field" htmlFor="school-month">조회할 월<input id="school-month" className="input" type="month" min="2000-01" max="2099-12" required value={month} onChange={event => { clearSchedule(); setMonth(event.target.value); }} /></label>
            <button className="button primary" type="submit" disabled={scheduleBusy || !month} style={{ alignSelf: "end" }}><CalendarDays size={16} aria-hidden="true" /> {scheduleBusy ? "불러오는 중…" : "일정 조회"}</button>
          </form>
          {scheduleError && <p className="notice" role="alert">{scheduleError}</p>}
          {scheduleBusy && <p role="status" className="muted">학사일정을 불러오고 있습니다…</p>}
          {scheduleFetchedAt && <>
            <p className="muted">조회 {fetchedTime(scheduleFetchedAt)} · 공개정보는 학교의 최신 안내와 다를 수 있습니다.</p>
            {eventsTruncated && <p className="notice" role="status">조회된 일정이 많아 일부만 표시합니다. 전체 일정은 학교의 공식 안내를 함께 확인해 주세요.</p>}
            {events.length === 0 ? <div className="empty-state">선택한 월에 공개된 학사일정이 없습니다.</div> : <div className="stack">{events.map((item, index) => <article key={`${item.date}-${item.title}-${index}`} className="row" style={{ padding: "14px 0", alignItems: "flex-start", borderBottom: "1px solid var(--border, #e8e9e6)" }}>
              <span className="badge" style={{ whiteSpace: "nowrap" }}>{displayDate(item.date)}</span>
              <div><strong>{item.title}</strong>{item.detail && <p className="muted" style={{ marginTop: "5px", whiteSpace: "pre-line" }}>{item.detail}</p>}</div>
            </article>)}</div>}
          </>}
          {!scheduleFetchedAt && !scheduleBusy && !scheduleError && <p className="muted">조회할 월을 고른 뒤 ‘일정 조회’를 눌러 주세요.</p>}
        </>}
      </section>
    </div>
  );
}
