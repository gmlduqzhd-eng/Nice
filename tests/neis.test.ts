import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/neis/route";

const SCHOOL_QUERY = "type=schools&q=학교";
const SCHEDULE_QUERY = "type=schedule&office=B10&school=7031110&month=202802";

function fixture(endpoint: string, rows: Record<string, unknown>[], total = rows.length) {
  return {
    [endpoint]: [
      { head: [{ list_total_count: total }, { RESULT: { CODE: "INFO-000" } }] },
      { row: rows },
    ],
  };
}

async function responseFor(query: string) {
  const response = await GET(new Request(`http://localhost/api/neis?${query}`));
  return { response, body: await response.json() };
}

function mockPayload(payload: unknown) {
  globalThis.fetch = async () => Response.json(payload);
}

// These tests share process.env and fetch. Keep them sequential, and restore both
// even when an assertion fails. No network requests or real keys are used.
describe("NEIS public API boundary", { concurrency: false }, () => {
  let previousFetch: typeof fetch;
  let previousKey: string | undefined;

  beforeEach(() => {
    previousFetch = globalThis.fetch;
    previousKey = process.env.NEIS_API_KEY;
    process.env.NEIS_API_KEY = "test-only-key";
    globalThis.fetch = async () => {
      throw new Error("Unexpected fetch: every test must explicitly mock its upstream response.");
    };
  });

  afterEach(() => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.NEIS_API_KEY;
    else process.env.NEIS_API_KEY = previousKey;
  });

  test("rejects unsupported request types", async () => {
    const { response, body } = await responseFor("type=private-student-records");
    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_TYPE");
  });

  test("rejects blank, short, long and control-character school names", async () => {
    for (const q of ["", "x", "학".repeat(61), "학교\u0001"]) {
      const { response, body } = await responseFor(`type=schools&q=${encodeURIComponent(q)}`);
      assert.equal(response.status, 400);
      assert.equal(body.code, "INVALID_QUERY");
    }
  });

  test("rejects invalid office and school identifiers", async () => {
    for (const query of [
      "type=schedule&office=https://other.example&school=7031110&month=202609",
      "type=schedule&office=B10&school=703&month=202609",
    ]) {
      const { response, body } = await responseFor(query);
      assert.equal(response.status, 400);
      assert.equal(body.code, "INVALID_SCHOOL");
    }
  });

  test("rejects invalid months before querying upstream", async () => {
    for (const month of ["202600", "202613", "2026-09", "", "20260901"]) {
      const { response, body } = await responseFor(`type=schedule&office=B10&school=7031110&month=${month}`);
      assert.equal(response.status, 400);
      assert.equal(body.code, "INVALID_MONTH");
    }
  });

  test("missing key returns 503 without attempting a fetch or returning demo data", async () => {
    delete process.env.NEIS_API_KEY;
    let called = false;
    globalThis.fetch = async () => { called = true; return Response.json({}); };
    const { response, body } = await responseFor(SCHOOL_QUERY);
    assert.equal(response.status, 503);
    assert.equal(body.code, "NEIS_NOT_CONFIGURED");
    assert.equal(called, false);
    assert.equal(body.schools, undefined);
  });

  test("schools use only the fixed official endpoint, normalize fields and cap the result", async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      SCHUL_NM: `가상초등학교${index}`,
      ATPT_OFCDC_SC_CODE: "B10",
      SD_SCHUL_CODE: String(7031110 + index),
      ORG_RDNMA: "서울",
      ORG_RDNDA: null,
      ORG_TELNO: "not exposed",
    }));
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://open.neis.go.kr");
      assert.equal(url.pathname, "/hub/schoolInfo");
      assert.equal(url.searchParams.get("KEY"), "test-only-key");
      assert.equal(url.searchParams.get("Type"), "json");
      assert.equal(url.searchParams.get("pIndex"), "1");
      assert.equal(url.searchParams.get("pSize"), "30");
      assert.equal(url.searchParams.get("SCHUL_KND_SC_NM"), "초등학교");
      assert.equal(options?.redirect, "error");
      return Response.json(fixture("schoolInfo", rows));
    };
    const { response, body } = await responseFor(SCHOOL_QUERY);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.schools.length, 30);
    assert.deepEqual(body.schools[0], { name: "가상초등학교0", officeCode: "B10", schoolCode: "7031110", address: "서울" });
    assert.equal(body.truncated, true);
    assert.ok(Number.isFinite(Date.parse(body.fetchedAt)));
    assert.ok(!JSON.stringify(body).includes("test-only-key"));
  });

  test("official no-data result becomes an empty list for both request types", async () => {
    mockPayload({ RESULT: { CODE: "INFO-200" } });
    for (const [query, field] of [[SCHOOL_QUERY, "schools"], [SCHEDULE_QUERY, "events"]]) {
      const { response, body } = await responseFor(query);
      assert.equal(response.status, 200);
      assert.deepEqual(body[field], []);
      assert.equal(body.truncated, false);
    }
  });

  test("rejected or restricted keys become sanitized 503 errors", async () => {
    for (const code of ["ERROR-290", "INFO-300"]) {
      mockPayload({ RESULT: { CODE: code, MESSAGE: "upstream secret: test-only-key" } });
      const { response, body } = await responseFor(SCHOOL_QUERY);
      assert.equal(response.status, 503);
      assert.equal(body.code, "NEIS_KEY_REJECTED");
      assert.ok(!JSON.stringify(body).includes("test-only-key"));
      assert.equal(body.schools, undefined);
    }
  });

  test("upstream quota exhaustion remains a visible failure", async () => {
    mockPayload({ RESULT: { CODE: "ERROR-337" } });
    const { response, body } = await responseFor(SCHOOL_QUERY);
    assert.equal(response.status, 503);
    assert.equal(body.code, "NEIS_QUOTA_EXCEEDED");
  });

  test("schedule uses actual month boundaries and normalizes sorted plain-text events", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/hub/SchoolSchedule");
      assert.equal(url.searchParams.get("AA_FROM_YMD"), "20280201");
      assert.equal(url.searchParams.get("AA_TO_YMD"), "20280229");
      assert.equal(url.searchParams.get("pSize"), "200");
      return Response.json(fixture("SchoolSchedule", [
        { AA_YMD: "20280229", EVENT_NM: "개학식", EVENT_CNTNT: "오전<br/>준비" },
        { AA_YMD: "20280201", EVENT_NM: "학년 행사", EVENT_CNTNT: null },
      ]));
    };
    const { response, body } = await responseFor(SCHEDULE_QUERY);
    assert.equal(response.status, 200);
    assert.deepEqual(body.events, [
      { date: "2028-02-01", title: "학년 행사", detail: "" },
      { date: "2028-02-29", title: "개학식", detail: "오전\n준비" },
    ]);
  });

  test("malformed upstream envelopes do not masquerade as empty successful data", async () => {
    for (const payload of [{ unexpected: [] }, { schoolInfo: [{ row: [] }] }, null]) {
      mockPayload(payload);
      const { response, body } = await responseFor(SCHOOL_QUERY);
      assert.equal(response.status, 502);
      assert.equal(body.code, "NEIS_INVALID_RESPONSE");
    }
  });

  test("HTTP failures are normalized without exposing upstream response bodies", async () => {
    globalThis.fetch = async () => new Response("Internal upstream details", { status: 500 });
    const { response, body } = await responseFor(SCHOOL_QUERY);
    assert.equal(response.status, 502);
    assert.equal(body.code, "NEIS_UNAVAILABLE");
    assert.ok(!JSON.stringify(body).includes("Internal upstream details"));
  });

  test("network errors are normalized without exposing secret-bearing request errors", async () => {
    globalThis.fetch = async () => { throw new Error("Failed URL?KEY=test-only-key"); };
    const { response, body } = await responseFor(SCHOOL_QUERY);
    assert.equal(response.status, 502);
    assert.equal(body.code, "NEIS_UNAVAILABLE");
    assert.ok(!JSON.stringify(body).includes("test-only-key"));
  });

  test("a stalled upstream is aborted after eight seconds with a 504 response", { timeout: 12_000 }, async () => {
    let aborted = false;
    globalThis.fetch = async (_input, options) => new Promise<Response>((_resolve, reject) => {
      assert.ok(options?.signal);
      options.signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      }, { once: true });
    });
    const { response, body } = await responseFor(SCHOOL_QUERY);
    assert.equal(response.status, 504);
    assert.equal(body.code, "NEIS_TIMEOUT");
    assert.equal(aborted, true);
  });
});
