# 외부 연결 설정과 검증

이 버전은 가상 자료로 사용할 수 있는 시제품입니다. 나이스 학교 검색·학사일정 조회와 Supabase 이메일 로그인·수동 저장을 위한 코드는 준비되어 있습니다. **프로젝트·인증키 연결, 실제 메일 발송, 원격 DB 스키마 적용은 수행하지 않았습니다.**

## 환경변수

프로젝트 루트의 `.env.example`을 `.env.local`로 복사하고 필요한 값만 설정합니다. Vercel에서는 해당 프로젝트의 Environment Variables에 같은 이름을 등록합니다. 공개 환경변수는 빌드 시 포함되므로 값을 변경하면 다시 빌드·배포합니다. 실제 키를 Git에 커밋하지 않습니다.

| 변수 | 위치·역할 |
| --- | --- |
| `NEIS_API_KEY` | 서버 전용. 나이스 교육정보 개방 포털의 인증키 |
| `NEXT_PUBLIC_SUPABASE_URL` | 연결할 Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_`로 시작하는 공개 키 |

Supabase `service_role`·`sb_secret_` 키는 이 앱에서 사용하지 않습니다. 공개 키 자체는 브라우저에 제공되며, 저장 자료의 접근 권한은 로그인과 데이터베이스 RLS가 제한합니다. 레거시 anon JWT는 현재 설정에서 받지 않으므로 프로젝트의 현대식 publishable key를 사용합니다.

## 나이스 공개정보

1. [나이스 교육정보 개방 포털 개발자 가이드](https://open.neis.go.kr/portal/guide/apiGuidePage.do)에 따라 인증키를 신청합니다.
2. `NEIS_API_KEY`를 설정한 뒤 개발 서버를 다시 시작합니다.
3. 앱에서 학교를 검색하고 주소를 확인해 선택한 다음 조회할 월을 고릅니다.

사용하는 API는 공식 HTTPS 호스트의 `schoolInfo`와 `SchoolSchedule`입니다. 학교 검색은 초등학교를 대상으로 하며 학교명, 시도교육청 코드, 학교 코드, 주소만 반환합니다. 학사일정은 선택한 월의 날짜·행사명·내용을 반환합니다. 학생별 출결·학생부를 읽거나 수정하는 기능은 제공하지 않습니다.

### 앱 내부 요청 계약

```text
GET /api/neis?type=schools&q=학교이름
GET /api/neis?type=schedule&office=B10&school=7031110&month=202609
```

```ts
type SchoolsResponse = {
  schools: { name: string; officeCode: string; schoolCode: string; address: string }[];
  truncated: boolean;
  fetchedAt: string; // 이 앱에서 조회한 시각, ISO 8601
};
type ScheduleResponse = {
  events: { date: string; title: string; detail: string }[]; // 날짜 YYYY-MM-DD
  truncated: boolean;
  fetchedAt: string;
};
type ErrorResponse = { error: string; code: string };
```

학교 검색어는 2~60자, 교육청 코드는 영문 대문자 1자와 숫자 2자, 학교 코드는 숫자 7자, 월은 `YYYYMM`입니다. 한 요청은 upstream 1페이지로 제한하며 학교 최대 30개, 월별 일정 최대 200개, 응답 제한시간 8초입니다. `truncated`가 참이면 전체 자료가 아니므로 학교 검색어를 구체화하거나 나이스 원문에서 추가 자료를 확인합니다. `fetchedAt`은 나이스 자료 자체의 최종 갱신일을 뜻하지 않습니다.

| 상태 | 의미 |
| --- | --- |
| 200 + 빈 배열 | 조건에 맞는 공개자료 없음 |
| 400 | 요청 인자 오류 |
| 503 / `NEIS_NOT_CONFIGURED` | 서버 인증키 미설정 |
| 503 / `NEIS_KEY_REJECTED` | 나이스에서 인증키 거부·제한 |
| 503 / `NEIS_QUOTA_EXCEEDED` | 나이스 조회 한도 도달 |
| 502 | 외부 서버·응답 오류 |
| 504 / `NEIS_TIMEOUT` | 응답 제한시간 초과 |

인증키가 없을 때 가상 응답으로 성공 처리하지 않습니다. 공식 사이트의 공개 샘플 응답으로 필드 구조를 확인했으며, 운영 인증키를 이용한 조회 검증은 연결 후 필요합니다. 키가 포함된 upstream URL이나 오류 원문을 로그·브라우저 응답에 전달하지 않습니다.

명세: [학교기본정보](https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17020190531110010104913&infSeq=2), [학사일정](https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17220190722175038389180&infSeq=2).

## Supabase 이메일 로그인

현재 구현은 **이메일 매직 링크**입니다. `signInWithOtp`라는 SDK 메서드를 사용하지만 사용자는 이메일의 로그인 링크를 누릅니다. 소셜 OAuth 공급자는 구성하지 않았습니다.

1. 사용할 Supabase 개발 프로젝트를 정합니다. 프로젝트의 URL과 publishable key를 환경변수에 넣습니다.
2. Authentication 설정에서 Email 공급자를 켭니다. 초대된 계정만 사용할지, 가입을 허용할지 운영 방침에 맞게 설정합니다. 초대 전용 운영이면 대시보드에서 계정을 준비하고 UI의 `shouldCreateUser` 설정도 맞춰야 합니다.
3. Authentication → URL Configuration에서 Site URL을 실제 운영 도메인으로 설정합니다. 로컬 개발만 할 때는 `http://localhost:3000`을 사용합니다.
4. Redirect URLs에 로컬 및 배포본의 **실제 전체 반환 URL**을 등록합니다. 예: `http://localhost:3000/`, `http://127.0.0.1:3000/`, `https://선택한-프로젝트.vercel.app/`. 앱이 `window.location.origin`을 `emailRedirectTo`로 보내므로 포트가 다르면 그 포트도 추가합니다. 필요할 때 신뢰하는 Preview URL을 별도로 추가합니다.
5. 초기 시험은 프로젝트 팀원 이메일로 진행합니다. 기본 SMTP는 전송 대상·횟수 제한이 있으므로 실제 사용자에게 제공할 때는 Custom SMTP를 구성하고 발신 도메인 및 전송을 검증합니다. [SMTP 설정](https://supabase.com/docs/guides/auth/auth-smtp)

브라우저 클라이언트는 implicit flow로 반환 URL의 세션을 읽고 보관합니다. 서버에서 인증 쿠키를 읽는 SSR 보호 경로는 이 버전에 없습니다. 로그인 여부는 클라이언트 `getUser()`로 확인하고, DB 요청은 사용자 토큰과 RLS로 검사합니다. [이메일 인증](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Redirect URL 설정](https://supabase.com/docs/guides/auth/redirect-urls), [브라우저 인증 흐름](https://supabase.com/docs/guides/auth/sessions/implicit-flow)

## 수동 저장용 참고 스키마

`supabase/schema.sql`은 **적용 전 참고 SQL**이며 정식 마이그레이션이나 운영 DB 적용 기록이 아닙니다. 새 개발 프로젝트에서 검토·적용한 다음 사용자별 접근 검증을 해야 합니다. 같은 테이블이 이미 존재하면 임의로 덮어쓰지 않고 현재 스키마와 차이를 먼저 확인합니다.

`public.teacher_workspaces`의 구조:

| 컬럼 | 역할 |
| --- | --- |
| `user_id uuid` | `auth.users.id` 참조, 기본키. 계정당 스냅샷 1개 |
| `data jsonb` | 앱의 `WorkspaceData` 전체. JSON 객체, DB 표현 기준 최대 2 MiB |
| `updated_at timestamptz` | 저장 시 앱에서 전달하는 시각. 위변조 방지 감사 로그가 아님 |

RLS는 로그인한 계정의 `auth.uid()`와 `user_id`가 일치하는 행에만 SELECT·INSERT·UPDATE·DELETE를 허용합니다. UPDATE에는 기존 소유자 검사와 변경 후 소유자 검사 둘 다 적용합니다. `anon`에는 테이블 권한을 주지 않습니다. 최근 Supabase의 테이블 노출 기본값 변경에 대응하도록 `authenticated` 권한을 SQL에 명시했습니다. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Data API 권한 변경](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

```ts
// UI의 저장 버튼에서 명시적으로 호출. 로그인만으로 업로드하지 않음.
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) throw new Error("로그인이 필요합니다.");
const { error } = await supabase.from("teacher_workspaces").upsert({
  user_id: user.id,
  data: workspace,
  updated_at: new Date().toISOString(),
}, { onConflict: "user_id" });
if (error) throw error;

// 반환된 data는 앱의 WorkspaceData 검증을 통과한 후 로컬 자료에 반영.
const result = await supabase.from("teacher_workspaces")
  .select("data,updated_at")
  .eq("user_id", user.id)
  .maybeSingle();
```

저장은 해당 계정의 이전 스냅샷을 대체합니다. 공동 편집, 변경 이력, 충돌 병합, 여러 기기 동시 저장 제어는 아직 없습니다. 불러오기를 적용하기 전에 로컬 자료를 백업합니다. 가상 자료·로컬 기록은 로그인이나 설정만으로 전송하지 않으며, 저장 버튼을 선택한 경우에만 보냅니다.

## 연결 후 확인할 동작

- 설정이 없는 상태에서 로컬 기록·점검·내보내기 기능이 동작하고 외부 연결은 미설정으로 표시되는지 확인합니다.
- 나이스 인증키를 연결하고 학교 검색 결과의 학교 코드·주소, 해당 학교의 한 달 일정을 공식 포털과 대조합니다.
- 이메일 링크로 로그인 → 수동 저장 → 로그아웃 → 재로그인 → 불러오기를 가상 데이터로 시험합니다.
- 계정 A·B를 별도로 준비하여 B가 A의 `user_id`를 넣은 직접 SELECT·UPDATE·DELETE 요청으로 A 행에 접근하지 못하는지 확인합니다. 소유자를 바꿔 INSERT·UPDATE하면 거절되는지 검사합니다.
- 로그아웃한 요청은 테이블 접근이 거절되는지, 로그인된 각 계정은 자신의 행만 조회·수정·삭제할 수 있는지 확인합니다.
- Supabase Advisors로 스키마·RLS·권한을 확인합니다. 실제 학생 자료 사용 전 접근권한·보유기간·외부 처리 조건을 확정합니다.

마지막 네트워크 연결 점검은 환경변수 및 대상 프로젝트가 정해진 뒤 수행해야 합니다. 정적 코드 검사나 빌드 성공을 실제 인증·DB 접근 검증으로 표시하지 않습니다.
