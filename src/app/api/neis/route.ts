const NEIS_ORIGIN = "https://open.neis.go.kr/hub/";
const TIMEOUT_MS = 8_000;
const SCHOOL_LIMIT = 30;
const EVENT_LIMIT = 200;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

class NeisError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

function record(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function cleanText(value: unknown, limit = 500): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, limit);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function validateResult(value: unknown): boolean {
  const code = record(value)?.CODE;
  if (code === "INFO-200") return false;
  if (code === "INFO-000" || code === "INFO-100") return true;
  if (code === "ERROR-290" || code === "INFO-300") {
    throw new NeisError("NEIS_KEY_REJECTED", "나이스 인증키를 확인해 주세요. 서버 설정에서 인증키를 변경한 뒤 다시 시도할 수 있습니다.", 503);
  }
  if (code === "ERROR-337") {
    throw new NeisError("NEIS_QUOTA_EXCEEDED", "나이스 조회 한도에 도달했습니다. 나중에 다시 시도해 주세요.", 503);
  }
  throw new NeisError("NEIS_UPSTREAM_ERROR", "나이스에서 자료를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

async function queryNeis(
  endpoint: "schoolInfo" | "SchoolSchedule",
  params: Record<string, string>,
  limit: number,
  key: string,
): Promise<{ rows: Row[]; truncated: boolean }> {
  const url = new URL(endpoint, NEIS_ORIGIN);
  url.search = new URLSearchParams({
    KEY: key,
    Type: "json",
    pIndex: "1",
    pSize: String(limit),
    ...params,
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new NeisError("NEIS_UNAVAILABLE", "나이스 공개정보 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const payload = record(await response.json());
    if (!payload) throw new NeisError("NEIS_INVALID_RESPONSE", "나이스 응답 형식을 확인할 수 없습니다.");
    if (payload.RESULT) {
      if (!validateResult(payload.RESULT)) return { rows: [], truncated: false };
    }

    const groups = payload[endpoint];
    if (!Array.isArray(groups)) {
      throw new NeisError("NEIS_INVALID_RESPONSE", "나이스 응답에서 자료를 확인할 수 없습니다.");
    }
    let total = 0;
    let sawRows = false;
    let sawSuccess = false;
    const rows: Row[] = [];
    for (const group of groups) {
      const item = record(group);
      if (!item) continue;
      if (Array.isArray(item.head)) {
        for (const head of item.head) {
          const header = record(head);
          if (header?.RESULT) {
            if (!validateResult(header.RESULT)) return { rows: [], truncated: false };
            sawSuccess = true;
          }
          if (typeof header?.list_total_count === "number") total = header.list_total_count;
        }
      }
      if (Array.isArray(item.row)) {
        sawRows = true;
        for (const row of item.row.slice(0, limit)) {
          const entry = record(row);
          if (entry && rows.length < limit) rows.push(entry);
        }
      }
    }
    if (!sawSuccess || !sawRows) {
      throw new NeisError("NEIS_INVALID_RESPONSE", "나이스 응답에서 자료를 확인할 수 없습니다.");
    }
    return { rows, truncated: total > rows.length };
  } catch (error) {
    if (error instanceof NeisError) throw error;
    if (controller.signal.aborted) {
      throw new NeisError("NEIS_TIMEOUT", "나이스 응답 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요.", 504);
    }
    // Do not log the request URL: it contains the server-side API key.
    throw new NeisError("NEIS_UNAVAILABLE", "나이스 공개정보를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const search = new URL(request.url).searchParams;
    const type = search.get("type");
    let params: Record<string, string>;

    if (type === "schools") {
      const q = (search.get("q") ?? "").trim();
      if (q.length < 2 || q.length > 60 || /[\u0000-\u001f\u007f]/.test(q)) {
        return json({ error: "학교 이름을 2~60자로 입력해 주세요.", code: "INVALID_QUERY" }, 400);
      }
      params = { SCHUL_NM: q, SCHUL_KND_SC_NM: "초등학교" };
    } else if (type === "schedule") {
      const office = search.get("office") ?? "";
      const school = search.get("school") ?? "";
      const month = search.get("month") ?? "";
      if (!/^[A-Z]\d{2}$/.test(office) || !/^\d{7}$/.test(school)) {
        return json({ error: "학교를 먼저 검색하여 선택해 주세요.", code: "INVALID_SCHOOL" }, 400);
      }
      if (!/^(19|20|21)\d{2}(0[1-9]|1[0-2])$/.test(month)) {
        return json({ error: "조회할 월을 YYYYMM 형식으로 입력해 주세요.", code: "INVALID_MONTH" }, 400);
      }
      const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4, 6)), 0)).getUTCDate();
      params = {
        ATPT_OFCDC_SC_CODE: office,
        SD_SCHUL_CODE: school,
        AA_FROM_YMD: `${month}01`,
        AA_TO_YMD: `${month}${lastDay}`,
      };
    } else {
      return json({ error: "지원하는 조회 유형은 schools 또는 schedule입니다.", code: "INVALID_TYPE" }, 400);
    }

    const key = process.env.NEIS_API_KEY?.trim();
    if (!key) {
      return json({
        error: "나이스 공개정보 연결 전입니다. 서버의 NEIS_API_KEY를 설정하면 학교 검색과 학사일정을 조회할 수 있습니다.",
        code: "NEIS_NOT_CONFIGURED",
      }, 503);
    }

    if (type === "schools") {
      const { rows, truncated } = await queryNeis("schoolInfo", params, SCHOOL_LIMIT, key);
      const schools = rows.map((row) => ({
        name: cleanText(row.SCHUL_NM, 100),
        officeCode: cleanText(row.ATPT_OFCDC_SC_CODE, 10),
        schoolCode: cleanText(row.SD_SCHUL_CODE, 20),
        address: [cleanText(row.ORG_RDNMA), cleanText(row.ORG_RDNDA)].filter(Boolean).join(" "),
      })).filter((school) => school.name && /^[A-Z]\d{2}$/.test(school.officeCode) && /^\d{7}$/.test(school.schoolCode));
      return json({ schools, truncated, fetchedAt: new Date().toISOString() });
    }

    const { rows, truncated } = await queryNeis("SchoolSchedule", params, EVENT_LIMIT, key);
    const events = rows.map((row) => {
      const date = cleanText(row.AA_YMD, 8);
      return {
        date: /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : "",
        title: cleanText(row.EVENT_NM, 200),
        detail: cleanText(row.EVENT_CNTNT, 2_000),
      };
    }).filter((event) => event.date && event.title)
      .sort((a, b) => a.date.localeCompare(b.date));
    return json({ events, truncated, fetchedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof NeisError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: "INTERNAL_ERROR" }, 500);
  }
}
