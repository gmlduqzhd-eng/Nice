import type { Student } from "./domain";

export type RosterEntry = Pick<Student, "number" | "name">;

/** A full class list may include unchanged students; only exact matches are kept. */
export function prepareRosterImport(entries: RosterEntry[], students: RosterEntry[]) {
  const existing = new Map(students.map(student => [student.number, student.name.trim()]));
  const additions: RosterEntry[] = [];
  let unchanged = 0;
  for (const student of entries) {
    const name = existing.get(student.number);
    if (name === undefined) additions.push(student);
    else if (name === student.name.trim()) unchanged++;
    else throw new Error(`${student.number}번은 현재 명부에 있습니다. 이름이 다르므로 추가하지 않았습니다. 기존 학생은 ‘학생 정보 수정’에서 확인하거나 가져올 명부의 번호를 고쳐 주세요.`);
  }
  if (students.length + additions.length > 500) throw new Error("현재 명부와 합쳐 500명 이하로 입력해 주세요.");
  return { additions, unchanged };
}

/** CSV (including quoted commas/newlines) or tab-separated Excel paste; never evaluate cells. */
export function parseRoster(text: string): RosterEntry[] {
  if (text.length > 100_000) throw new Error("명부는 100,000자 이하로 입력해 주세요.");
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delimiter = source.split("\n")[0].includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  const finishField = () => { row.push(field.trim()); field = ""; closed = false; };
  const finishRow = () => { finishField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === delimiter) finishField();
    else if (char === "\n") finishRow();
    else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"') throw new Error("따옴표 형식이 올바르지 않습니다. CSV 형식을 확인해 주세요.");
    else field += char;
  }
  if (quoted) throw new Error("닫히지 않은 따옴표가 있습니다.");
  finishRow();
  if (rows[0]?.length === 2 && /^(번호|number)$/i.test(rows[0][0]) && /^(이름|name)$/i.test(rows[0][1])) rows.shift();
  if (!rows.length || rows.length > 500) throw new Error("번호와 이름을 1~500명 입력해 주세요.");
  const numbers = new Set<number>();
  return rows.map((cells, index) => {
    if (cells.length !== 2 || !/^\d{1,3}$/.test(cells[0]) || Number(cells[0]) < 1 || !cells[1] || cells[1].length > 100 || /[\u0000-\u001f\u007f]/.test(cells[1])) {
      throw new Error(`${index + 1}번째 학생의 번호(1~999)와 이름을 확인해 주세요. 두 열만 사용할 수 있습니다.`);
    }
    const number = Number(cells[0]);
    if (numbers.has(number)) throw new Error(`${number}번이 중복되어 있습니다.`);
    numbers.add(number);
    return { number, name: cells[1] };
  }).sort((a, b) => a.number - b.number);
}

export function exportRoster(students: RosterEntry[]): string {
  const quote = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  return '\uFEFF번호,이름\r\n' + [...students].sort((a, b) => a.number - b.number).map(student => `${student.number},${quote(student.name)}`).join("\r\n");
}
