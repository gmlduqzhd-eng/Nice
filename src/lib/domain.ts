/** Local preparation rules, not official NEIS validation or an official byte limit. */
export type DraftStatus = "draft" | "reviewed" | "copied" | "confirmed";

export interface Student {
  id: string;
  number: number;
  name: string;
}

export interface Observation {
  id: string;
  studentId: string;
  date: string;
  category: string;
  content: string;
}

export interface Draft {
  id: string;
  studentId: string;
  content: string;
  evidenceIds: string[];
  status: DraftStatus;
  updatedAt: string;
}

export interface WorkspaceData {
  version: 3;
  classroom: Classroom;
  students: Student[];
  observations: Observation[];
  drafts: Draft[];
  semesterPreparation?: SemesterPreparation;
}

/** One current semester task, independent of behavior drafts and NEIS entry. */
export interface SemesterPreparationEntry {
  content: string;
  reviewedSnapshot: string | null;
}

export interface SemesterPreparation {
  classroom: Classroom;
  subject: string;
  entries: Record<string, SemesterPreparationEntry>;
}

export interface Classroom {
  year: number;
  grade: number;
  room: string;
  semester: 1 | 2;
}

export const DEFAULT_CLASSROOM: Classroom = { year: 2026, grade: 4, room: "2", semester: 2 };

function validClassroom(value: unknown): value is Classroom {
  return isRecord(value) && Number.isInteger(value.year) && Number(value.year) >= 2000 && Number(value.year) <= 2100 &&
    Number.isInteger(value.grade) && Number(value.grade) >= 1 && Number(value.grade) <= 6 &&
    isText(value.room, 20) && !!value.room.trim() && !/[\r\n\t]/.test(value.room) &&
    (value.semester === 1 || value.semester === 2);
}

export type IssueKind =
  | "empty-draft"
  | "no-evidence"
  | "missing-evidence"
  | "wrong-student-evidence"
  | "duplicate-content"
  | "other-student-name"
  | "no-observations";

export interface Issue {
  id: string;
  studentId: string;
  draftId?: string;
  kind: IssueKind;
  severity: "warning" | "info";
  title: string;
  detail: string;
}

const DRAFT_STATUSES: DraftStatus[] = ["draft", "reviewed", "copied", "confirmed"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length <= limit && !value.includes("\0");
const isId = (value: unknown): value is string =>
  isText(value, 160) && value.length > 0 && value.trim() === value;
const unique = (values: Array<string | number>) => new Set(values).size === values.length;
const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value) &&
  isDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

function parseSemesterPreparation(value: unknown, studentIds: Set<string>): SemesterPreparation | null {
  if (!isRecord(value) || !isRecord(value.classroom) || !isRecord(value.entries)) return null;
  const c = value.classroom;
  // A draft may have an unfinished year/room/subject. Review and job export
  // apply the stricter target rules; typing an empty field must not lose a draft.
  if (!Number.isSafeInteger(c.year) ||
      !Number.isInteger(c.grade) || Number(c.grade) < 1 || Number(c.grade) > 6 ||
      !isText(c.room, 20) || /[\u0000-\u001f\u007f]/.test(c.room) ||
      (c.semester !== 1 && c.semester !== 2) ||
      !isText(value.subject, 40) || /[\u0000-\u001f\u007f]/.test(value.subject)) return null;
  const entries = Object.entries(value.entries);
  if (entries.length > 500) return null;
  const clean: [string, SemesterPreparationEntry][] = [];
  for (const [id, entry] of entries) {
    if (!isId(id) || !studentIds.has(id) || !isRecord(entry) || !isText(entry.content, 6000) ||
        (entry.reviewedSnapshot !== null && !isText(entry.reviewedSnapshot, 200_000))) return null;
    clean.push([id, { content: entry.content, reviewedSnapshot: entry.reviewedSnapshot as string | null }]);
  }
  return { classroom: { year: Number(c.year), grade: Number(c.grade), room: c.room, semester: c.semester },
    subject: value.subject, entries: Object.fromEntries(clean) };
}

function invalidateSemesterPreparation(data: WorkspaceData, removedId?: string): SemesterPreparation | undefined {
  const task = data.semesterPreparation;
  if (!task) return undefined;
  return { ...task, entries: Object.fromEntries(Object.entries(task.entries)
    .filter(([id]) => id !== removedId)
    .map(([id, entry]) => [id, { content: entry.content, reviewedSnapshot: null }])) };
}

/** Validate persisted/imported JSON and return a clean, independent object. */
export function parseWorkspace(input: unknown): WorkspaceData | null {
  if (!isRecord(input) || (input.version !== 1 && input.version !== 2 && input.version !== 3)) return null;
  const classroom = input.version === 1 ? DEFAULT_CLASSROOM : input.classroom;
  if (!validClassroom(classroom)) return null;
  const { students, observations, drafts } = input;
  if (!Array.isArray(students) || students.length > 500 ||
      !Array.isArray(observations) || observations.length > 50_000 ||
      !Array.isArray(drafts) || drafts.length > 5_000) return null;

  const cleanStudents: Student[] = [];
  for (const item of students) {
    if (!isRecord(item) || !isId(item.id) ||
        typeof item.number !== "number" || !Number.isInteger(item.number) ||
        item.number < 1 || item.number > 999 ||
        !isText(item.name, 100) || !item.name.trim()) return null;
    cleanStudents.push({ id: item.id, number: item.number, name: item.name });
  }
  if (!unique(cleanStudents.map((s) => s.id)) || !unique(cleanStudents.map((s) => s.number))) return null;
  const studentIds = new Set(cleanStudents.map((s) => s.id));

  const cleanObservations: Observation[] = [];
  for (const item of observations) {
    if (!isRecord(item) || !isId(item.id) || !isId(item.studentId) ||
        !studentIds.has(item.studentId) || !isDate(item.date) ||
        !isText(item.category, 100) || !item.category.trim() ||
        !isText(item.content, 10_000) || !item.content.trim()) return null;
    cleanObservations.push({
      id: item.id, studentId: item.studentId, date: item.date,
      category: item.category, content: item.content,
    });
  }
  if (!unique(cleanObservations.map((o) => o.id))) return null;

  const cleanDrafts: Draft[] = [];
  for (const item of drafts) {
    if (!isRecord(item) || !isId(item.id) || !isId(item.studentId) ||
        !studentIds.has(item.studentId) || !isText(item.content, 50_000) ||
        !Array.isArray(item.evidenceIds) || item.evidenceIds.length > 500 ||
        !item.evidenceIds.every(isId) || !unique(item.evidenceIds) ||
        !DRAFT_STATUSES.includes(item.status as DraftStatus) || !isTimestamp(item.updatedAt)) return null;
    cleanDrafts.push({
      id: item.id, studentId: item.studentId, content: item.content,
      evidenceIds: [...item.evidenceIds], status: item.status as DraftStatus,
      updatedAt: item.updatedAt,
    });
  }
  if (!unique(cleanDrafts.map((d) => d.id))) return null;
  const result: WorkspaceData = { version: 3, classroom: { year: classroom.year, grade: classroom.grade, room: classroom.room.trim(), semester: classroom.semester }, students: cleanStudents, observations: cleanObservations, drafts: cleanDrafts };
  const evidenceIndex = new Map(cleanObservations.map((observation) => [observation.id, observation.studentId]));
  // Draft-stage broken links remain inspectable. Completed stages must retain valid evidence.
  if (cleanDrafts.some((draft) => draft.status !== "draft" && !canReview(result, draft, evidenceIndex))) return null;
  if (input.semesterPreparation !== undefined) {
    const task = parseSemesterPreparation(input.semesterPreparation, studentIds);
    if (!task) return null;
    result.semesterPreparation = task;
  }
  return result;
}

export function updateClassroom(data: WorkspaceData, classroom: Classroom): WorkspaceData {
  if (!validClassroom(classroom)) throw new Error("학년도(2000~2100), 학년(1~6), 반과 학기를 확인해 주세요.");
  return { ...data, classroom: { ...classroom, room: classroom.room.trim() } };
}

export function addStudents(data: WorkspaceData, students: Student[]): WorkspaceData {
  if (!students.length) throw new Error("추가할 학생을 입력해 주세요.");
  const next = { ...data, ...(data.semesterPreparation ? { semesterPreparation: invalidateSemesterPreparation(data) } : {}),
    students: [...data.students, ...students.map(student => ({ ...student, name: student.name.trim() }))].sort((a, b) => a.number - b.number) };
  const parsed = parseWorkspace(next);
  if (!parsed) throw new Error("번호(1~999) 중복, 이름 또는 최대 인원(500명)을 확인해 주세요.");
  return parsed;
}

export function editStudent(data: WorkspaceData, id: string, number: number, name: string): WorkspaceData {
  const student = data.students.find(item => item.id === id);
  if (!student) throw new Error("학생을 찾을 수 없습니다.");
  const trimmed = name.trim();
  // A name can occur in any draft. Preserve the text and its evidence, but require re-review.
  const next = { ...data,
    students: data.students.map(item => item.id === id ? { ...item, number, name: trimmed } : item).sort((a, b) => a.number - b.number),
    drafts: student.name === trimmed ? data.drafts : data.drafts.map(draft => ({ ...draft, status: "draft" as const, updatedAt: new Date().toISOString() })),
    ...(data.semesterPreparation && (student.name !== trimmed || student.number !== number)
      ? { semesterPreparation: invalidateSemesterPreparation(data) } : {}),
  };
  const parsed = parseWorkspace(next);
  if (!parsed) throw new Error("번호(1~999) 중복과 이름을 확인해 주세요.");
  return parsed;
}

export function removeStudent(data: WorkspaceData, id: string): WorkspaceData {
  if (!data.students.some(student => student.id === id)) throw new Error("학생을 찾을 수 없습니다.");
  if (data.observations.some(item => item.studentId === id) || data.drafts.some(item => item.studentId === id) ||
      (data.semesterPreparation && Object.hasOwn(data.semesterPreparation.entries, id) && data.semesterPreparation.entries[id].content.trim())) {
    throw new Error("관찰 기록이나 행특·학기말 초안이 연결된 학생은 삭제할 수 없습니다. 기존 기록을 먼저 확인해 주세요.");
  }
  return { ...data, students: data.students.filter(student => student.id !== id),
    ...(data.semesterPreparation ? { semesterPreparation: invalidateSemesterPreparation(data, id) } : {}) };
}

const normalizeContent = (content: string) => content.normalize("NFC").trim().replace(/\s+/gu, " ");

export function getIssues(data: WorkspaceData): Issue[] {
  const issues: Issue[] = [];
  const observations = new Map(data.observations.map((observation) => [observation.id, observation]));
  const studentNames = new Map(data.students.map((student) => [student.id, student.name]));
  const groups = new Map<string, Draft[]>();
  for (const draft of data.drafts) {
    const normalized = normalizeContent(draft.content);
    if (normalized) groups.set(normalized, [...(groups.get(normalized) ?? []), draft]);
  }
  for (const student of data.students) {
    if (!data.drafts.some((draft) => draft.studentId === student.id)) {
      issues.push({ id: `empty-draft:${student.id}`, studentId: student.id, kind: "empty-draft", severity: "warning", title: "초안이 아직 없어요", detail: "관찰 기록을 확인하고 입력할 초안을 작성해 주세요." });
    }
    if (!data.observations.some((observation) => observation.studentId === student.id)) {
      issues.push({ id: `no-observations:${student.id}`, studentId: student.id, kind: "no-observations", severity: "info", title: "관찰 기록이 필요해요", detail: "이 학생의 관찰 기록이 아직 없습니다. 실제 관찰한 내용을 기록해 주세요." });
    }
  }
  for (const draft of data.drafts) {
    const add = (kind: IssueKind, title: string, detail: string, severity: "warning" | "info" = "warning") => {
      issues.push({ id: `${kind}:${draft.id}`, studentId: draft.studentId, draftId: draft.id, kind, severity, title, detail });
    };
    if (!draft.content.trim()) add("empty-draft", "입력할 문장이 비어 있어요", "관찰 기록을 근거로 초안을 작성한 뒤 검토해 주세요.");
    if (!draft.evidenceIds.length) add("no-evidence", "관찰 근거가 연결되지 않았어요", "초안 내용을 뒷받침하는 이 학생의 관찰 기록을 선택해 주세요.");
    const missing = draft.evidenceIds.filter((id) => !observations.has(id));
    if (missing.length) add("missing-evidence", "연결한 관찰 기록을 찾을 수 없어요", `연결된 기록 ${missing.length}건이 없습니다. 근거를 다시 선택해 주세요.`);
    const mismatched = draft.evidenceIds.filter((id) => observations.has(id) && observations.get(id)!.studentId !== draft.studentId);
    if (mismatched.length) add("wrong-student-evidence", "다른 학생의 근거가 연결되어 있어요", "학생과 관찰 기록의 연결을 확인하고 이 학생의 근거를 선택해 주세요.");
    const matches = (groups.get(normalizeContent(draft.content)) ?? []).filter((other) => other.studentId !== draft.studentId);
    if (matches.length) {
      const names = [...new Set(matches.map((other) => studentNames.get(other.studentId) ?? "알 수 없는 학생"))];
      add("duplicate-content", "다른 학생과 같은 문장이 있어요", `${names.join(", ")} 학생의 초안과 공백 정리 후 문장이 같습니다. 개별 관찰 내용에 맞는지 검토해 주세요.`);
    }
    const namedStudents = data.students.filter((student) => student.id !== draft.studentId && draft.content.includes(student.name));
    if (namedStudents.length) add("other-student-name", "다른 학생 이름이 포함되어 있어요", `${namedStudents.map((student) => student.name).join(", ")} 이름이 포함되어 있습니다. 문맥과 입력 대상을 확인해 주세요.`);
  }
  return issues;
}

function canReview(data: WorkspaceData, draft: Draft, evidenceIndex = new Map(data.observations.map((observation) => [observation.id, observation.studentId]))): boolean {
  return !!draft.content.trim() && draft.evidenceIds.length > 0 && draft.evidenceIds.every((id) => evidenceIndex.get(id) === draft.studentId);
}

export function updateDraft(data: WorkspaceData, id: string, content: string, evidenceIds: string[], updatedAt = new Date().toISOString()): WorkspaceData {
  const draft = data.drafts.find((item) => item.id === id);
  if (!draft) throw new Error("초안을 찾을 수 없습니다.");
  if (!isText(content, 50_000) || !Array.isArray(evidenceIds) || evidenceIds.length > 500 || !evidenceIds.every(isId) || !isTimestamp(updatedAt)) throw new Error("초안 형식이 올바르지 않습니다.");
  const ids = [...new Set(evidenceIds)];
  if (ids.some((evidenceId) => !data.observations.some((observation) => observation.id === evidenceId && observation.studentId === draft.studentId))) throw new Error("이 학생의 유효한 관찰 기록을 선택해 주세요.");
  const evidenceUnchanged = ids.length === draft.evidenceIds.length && ids.every((evidenceId) => draft.evidenceIds.includes(evidenceId));
  if (content === draft.content && evidenceUnchanged) return data;
  return { ...data, drafts: data.drafts.map((item) => item.id === id ? { ...item, content, evidenceIds: ids, status: "draft", updatedAt } : item) };
}

export function transitionDraft(data: WorkspaceData, id: string, status: DraftStatus, options: { clipboardSucceeded?: boolean } = {}): WorkspaceData {
  const draft = data.drafts.find((item) => item.id === id);
  if (!draft) throw new Error("초안을 찾을 수 없습니다.");
  if (!DRAFT_STATUSES.includes(status)) throw new Error("올바르지 않은 작업 상태입니다.");
  if (status !== "draft" && !canReview(data, draft)) throw new Error("문장과 이 학생의 유효한 관찰 근거를 먼저 확인해 주세요.");
  if (status === "copied" && (draft.status === "draft" || !options.clipboardSucceeded)) throw new Error("검토를 완료하고 클립보드 복사가 성공한 뒤 표시할 수 있습니다.");
  if (status === "confirmed" && draft.status !== "copied" && draft.status !== "confirmed") throw new Error("먼저 복사한 뒤 나이스에서 반영 여부를 직접 확인해 주세요.");
  if (draft.status === status) return data;
  return { ...data, drafts: data.drafts.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item) };
}

export function addObservation(data: WorkspaceData, observation: Observation): WorkspaceData {
  if (data.observations.some((item) => item.id === observation.id)) throw new Error("같은 ID의 관찰 기록이 있습니다.");
  const next = { ...data, observations: [...data.observations, { ...observation }] };
  if (!parseWorkspace(next)) throw new Error("관찰 기록의 학생, 날짜, 분류와 내용을 확인해 주세요.");
  return next;
}

export function editObservation(data: WorkspaceData, id: string, patch: Partial<Pick<Observation, "date" | "category" | "content">>): WorkspaceData {
  const existing = data.observations.find((item) => item.id === id);
  if (!existing) throw new Error("관찰 기록을 찾을 수 없습니다.");
  const replacement = {
    ...existing,
    date: patch.date ?? existing.date,
    category: patch.category ?? existing.category,
    content: patch.content ?? existing.content,
  };
  if (replacement.date === existing.date && replacement.category === existing.category && replacement.content === existing.content) return data;
  const next: WorkspaceData = {
    ...data,
    observations: data.observations.map((item) => item.id === id ? replacement : item),
    drafts: data.drafts.map((draft) => draft.evidenceIds.includes(id) ? { ...draft, status: "draft", updatedAt: new Date().toISOString() } : draft),
  };
  if (!parseWorkspace(next)) throw new Error("관찰 기록의 날짜, 분류와 내용을 확인해 주세요.");
  return next;
}

export function deleteObservation(data: WorkspaceData, id: string): WorkspaceData {
  if (!data.observations.some((observation) => observation.id === id)) return data;
  return {
    ...data,
    observations: data.observations.filter((observation) => observation.id !== id),
    // Keep broken links so the teacher can identify and replace a removed source.
    drafts: data.drafts.map((draft) => draft.evidenceIds.includes(id) ? { ...draft, status: "draft", updatedAt: new Date().toISOString() } : draft),
  };
}

/** Informational UTF-8 size only. NEIS field limits must be verified separately. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
