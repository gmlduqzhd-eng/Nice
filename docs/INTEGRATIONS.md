# 외부 연결 설정과 검증

이 버전은 가상 자료로 사용할 수 있는 시제품입니다. 2026-09-29 기존 Supabase `Nice` 프로젝트를 Vercel 배포본에 연결하고 백업 테이블 스키마를 적용했습니다. 데이터베이스 접근 격리와 실제 익명 REST 접근 거부는 검증했습니다. **일반 Chrome의 실제 Google 로그인·가상 자료 수동 저장·같은 브라우저 복원까지 확인했습니다.** 다른 브라우저의 불러오기 성공 안내는 사용자가 확인했습니다. 이메일 로그인, 독립 브라우저의 복원 내용 직접 대조와 실제 두 계정의 접근 격리는 미검증이며 나이스 인증키는 미설정입니다. 연결 대상과 배포 절차는 [배포 안내](DEPLOYMENT.md), 확인한 범위는 [검증 기록](VERIFICATION.md)을 참고하세요.

## 환경변수

프로젝트 루트의 `.env.example`을 `.env.local`로 복사하고 필요한 값만 설정합니다. Vercel에서는 해당 프로젝트의 Environment Variables에 같은 이름을 등록합니다. 공개 환경변수는 빌드 시 포함되므로 값을 변경하면 다시 빌드·배포합니다. 실제 키를 Git에 커밋하지 않습니다.

| 변수 | 위치·역할 |
| --- | --- |
| `NEIS_API_KEY` | 서버 전용. 나이스 교육정보 개방 포털의 인증키 |
| `NEXT_PUBLIC_SUPABASE_URL` | 연결할 Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_`로 시작하는 공개 키 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | GIS용 공개 웹 Client ID. Supabase Google 공급자에 등록한 값과 일치 |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Google 로그인 버튼 표시. 기본 `false`, 공급자·origin 준비 후 대상 빌드에서 활성화·검증 |
| `ENABLE_EXPERIMENTAL_COREPACK` | Vercel 빌드용. 값 `1`로 고정된 pnpm 11.19.0 사용 |

Vercel `nice_helper_ys`에는 Supabase URL·공개 키와 Corepack 설정을 All Environments에 등록했습니다. 로컬 `.env.local`에도 Supabase 공개 설정을 별도로 작성했으며 Git에서 제외됩니다. Vercel 등록만으로 로컬 파일이 자동 생성되지는 않습니다. 나이스 인증키는 아직 등록하지 않았습니다.

Supabase `service_role`·`sb_secret_` 키는 이 앱에서 사용하지 않습니다. 공개 키 자체는 브라우저에 제공되며, 저장 자료의 접근 권한은 로그인과 데이터베이스 RLS가 제한합니다. 레거시 anon JWT는 현재 설정에서 받지 않으므로 프로젝트의 현대식 publishable key를 사용합니다. Google Client ID도 공개 앱 식별자입니다. GIS 방식은 Client Secret을 사용하지 않으며 사용자 ID token·액세스·갱신 토큰을 환경변수나 로그에 저장하지 않습니다.

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

이메일 인증 경로는 **이메일 매직 링크**입니다. 상단 ‘회원가입 · 로그인’ 또는 계정 화면에서 하나의 로그인 창을 엽니다. 이메일 입력 → 로그인 링크 받기 → 메일의 링크 클릭 순서이며 비밀번호·학교·이름을 추가로 받지 않습니다. `signInWithOtp`라는 SDK 메서드에 `shouldCreateUser: true`를 전달해 처음 사용하는 주소도 같은 요청으로 가입합니다. 숫자 인증번호 입력 UI는 없습니다.

### 현재 메일 제공 범위

기존 `Nice` 프로젝트는 기본 SMTP를 사용합니다. 이 방식은 **Supabase 조직 팀원 주소에만 메일을 보낼 수 있으므로 일반 교사 누구나 이메일로 가입할 수 있는 상태가 아닙니다.** 사용자 화면에 테스트 계정 제한을 표시하며 로그인 없이 기록 기능을 체험할 수 있게 했습니다. 일반 사용자에게 메일 로그인을 제공하려면 Custom SMTP를 구성하고 발송·수신을 검증해야 합니다. 가입 사용자를 늘리려고 교사에게 Supabase 관리 조직 권한을 부여하지 않습니다. [Supabase SMTP 제한](https://supabase.com/docs/guides/auth/auth-smtp)

2026-09-29 대시보드에서 메일 템플릿 수정이 잠겨 있고 Custom SMTP 연결을 요구하는 상태를 확인했습니다. 2026-06-03부터 생성된 무료 프로젝트가 기본 SMTP를 사용하면 기본 템플릿을 변경할 수 없다는 정책에 해당합니다. 따라서 이메일 경로는 기본 메일 링크이며, 템플릿에 숫자 토큰을 추가했다고 가정하지 않습니다. [이메일 템플릿 정책 변경](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)

### 앱 동작과 반환 주소

현재 프로젝트는 Email 공급자가 활성화되어 있고 이메일 확인이 필요합니다. 2026-09-29 저장 후 다시 확인한 Site URL은 `https://nicehelperys.vercel.app`입니다. Redirect URLs에는 아래 세 주소 각각의 마지막 `/` 유무를 포함해 총 6개를 등록했습니다.

- `https://nicehelperys.vercel.app`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

로그인 요청 후 보낸 주소와 메일함 안내를 표시하며 같은 주소 재전송에는 60초 대기시간을 둡니다. 이메일 변경·창 닫기 후 늦게 완료된 요청은 해당 화면을 다시 바꾸지 않습니다. 이메일 입력값과 대기시간은 메모리에만 두고 가입 양식 값으로 영구 저장하지 않습니다. 인증 세션은 Supabase 클라이언트가 별도로 보관합니다. 실제 이메일 전송·수신, 반환 세션 및 로그인한 사용자의 원격 백업 동작은 별도 확인이 필요합니다. 테스트 대역을 사용한 검증과 실제 인증을 구분해 [검증 기록](VERIFICATION.md)에 남깁니다. 새 환경에서는 아래 절차를 따릅니다.

1. 사용할 Supabase 개발 프로젝트를 정합니다. 프로젝트의 URL과 publishable key를 환경변수에 넣습니다.
2. Authentication 설정에서 Email 공급자를 켭니다. 초대된 계정만 사용할지, 가입을 허용할지 운영 방침에 맞게 설정합니다. 초대 전용 운영이면 대시보드에서 계정을 준비하고 UI의 `shouldCreateUser` 설정도 맞춰야 합니다.
3. Authentication → URL Configuration에서 Site URL을 실제 운영 도메인으로 설정합니다. 로컬 개발만 할 때는 `http://localhost:3000`을 사용합니다.
4. Redirect URLs에 로컬 및 배포본의 **실제 전체 반환 URL**을 등록합니다. 예: `http://localhost:3000/`, `http://127.0.0.1:3000/`, `https://선택한-프로젝트.vercel.app/`. 앱이 `window.location.origin`을 `emailRedirectTo`로 보내므로 포트가 다르면 그 포트도 추가합니다. 필요할 때 신뢰하는 Preview URL을 별도로 추가합니다.
5. 초기 시험은 프로젝트 팀원 이메일로 진행합니다. 기본 SMTP는 전송 대상·횟수 제한이 있으므로 실제 사용자에게 제공할 때는 Custom SMTP를 구성하고 발신 도메인 및 전송을 검증합니다. [SMTP 설정](https://supabase.com/docs/guides/auth/auth-smtp)

브라우저 클라이언트는 implicit flow로 반환 URL의 세션을 읽고 보관합니다. `AuthProvider`가 앱 시작 시 초기화하므로 별도로 설정 화면을 열 필요가 없습니다. 반환 URL의 만료·거부 오류뿐 아니라 초기 토큰 확인 요청의 실패도 검사합니다. 실패하면 오류 설명과 세션·공급자 토큰 필드를 주소에서 지우고 새 로그인 링크를 받을 수 있도록 안내합니다. 관련 없는 query·hash 값은 유지합니다. `onAuthStateChange`에서는 상태만 바꾸며 다른 인증 호출을 기다리지 않습니다. 로그아웃은 현재 브라우저 세션에 적용하며 로컬 연습 자료는 남습니다.

서버에서 인증 쿠키를 읽는 SSR 보호 경로는 이 버전에 없습니다. 초기 로그인 상태와 클라우드 저장 직전 사용자 신원은 `getUser()`로 확인하고, DB 요청은 사용자 토큰과 RLS로 검사합니다. [이메일 인증](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Redirect URL 설정](https://supabase.com/docs/guides/auth/redirect-urls), [브라우저 인증 흐름](https://supabase.com/docs/guides/auth/sessions/implicit-flow)

## Google GIS 로그인 설정과 검증

Supabase Google 공급자에 공개 Client ID를 등록하고 Secret은 빈값으로 저장했으며 공개 Auth 설정에서 `google: true`를 확인했습니다. Google 웹 클라이언트에 운영 origin `https://nicehelperys.vercel.app`도 등록했습니다. 앱은 GIS 공식 버튼의 ID token을 `signInWithIdToken({ provider: "google", token, nonce })`으로 교환하도록 구현했고 로컬 검증을 마쳤습니다. 커밋 `d4bd638`의 `nice_helper_ys` 배포가 Ready이며 운영 앱에서 Google 공식 한국어 버튼 표시를 확인했습니다. 이 인증 경로는 Client Secret을 사용하지 않습니다. [Supabase GIS 안내](https://supabase.com/docs/guides/auth/social-login/auth-google#google-pre-built)

**Google 앱은 Production으로 전환했으며, 일반 Chrome의 실제 계정 인증·가상 자료 원격 저장·같은 브라우저 복원을 확인했습니다.** 다른 브라우저의 불러오기 성공 안내는 사용자 확인입니다. 해당 브라우저의 복원 원문 직접 대조, 다른 PC 확인, 로그아웃 후 재로그인과 실제 두 계정의 접근 격리는 남아 있습니다. 인증 센터에서 기본 인증 범위에는 데이터 접근 심사가 필요 없다는 안내를 확인했습니다. 앱 이름·로고 표시용 브랜드 검증은 진행하지 않았습니다. 이전 Chrome 연결 중단 및 Codex 내장 브라우저의 FedCM 오류 관측은 [Google 로그인 안내](GOOGLE_AUTH.md)에 시점별로 기록했습니다. Secret 수동 입력은 필요하지 않습니다. 공개 전환·공식 버튼 표시만으로 인증 성공을 판단하지 않으며, 기존 모의 테스트와 실제 결과를 구분합니다.

앱에는 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`와 `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`를 설정한 뒤 다시 빌드합니다. Client ID는 Supabase에 등록한 웹 클라이언트와 일치해야 하며, 실제로 사용할 origin도 Google 설정에 등록해야 합니다. GIS popup의 JavaScript callback에는 새 redirect endpoint가 필요하지 않습니다. nonce 원문은 Supabase로, SHA-256 hex는 GIS로 전달하며 nonce 검사 생략은 사용하지 않습니다. 추가 Google 데이터 권한이나 오프라인 접근은 요청하지 않습니다. 정확한 주소·공개 설정·검증 절차는 [Google 로그인 안내](GOOGLE_AUTH.md)에 기록합니다.

## 수동 저장용 스키마

`supabase/schema.sql`은 2026-09-29 Supabase `Nice` 프로젝트의 대시보드 SQL Editor에서 적용했습니다. 적용 전 `public` 테이블이 비어 있음을 확인했습니다. **이 파일은 Supabase CLI 마이그레이션 이력이 아니며, 같은 프로젝트에 그대로 다시 실행하는 용도가 아닙니다.** 다음 스키마 변경은 실제 DB 상태와 차이를 먼저 확인하고 별도 변경 파일과 검증 기록으로 관리합니다.

적용 후 SQL 트랜잭션에서 소유자 CRUD, 타 사용자 접근·소유자 변경 차단, 익명 권한 및 데이터 제약조건 검증이 모두 통과했습니다. 검증 데이터는 트랜잭션 롤백으로 되돌렸으며 Auth 사용자 목록이 비어 있음을 확인했습니다. 재현용 SQL은 [`supabase/tests/rls-verification.sql`](../supabase/tests/rls-verification.sql)에 있습니다. 원격에서는 공백과 설명을 축약한 동등 SQL을 실행했습니다. 공개 키로 호출한 익명 REST 조회도 HTTP 401, PostgreSQL 코드 `42501`로 거부되었습니다. 이 결과는 이메일 로그인과 브라우저 전체 저장 흐름의 검증을 대신하지 않습니다.

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

## 이후 확인할 동작

- 설정이 없는 상태에서 로컬 기록·점검·내보내기 기능이 동작하고 외부 연결은 미설정으로 표시되는지 확인합니다.
- 나이스 인증키를 연결하고 학교 검색 결과의 학교 코드·주소, 해당 학교의 한 달 일정을 공식 포털과 대조합니다.
- Google 로그인과 허용된 이메일 링크 로그인을 각각 시험하고, 로그인 → 수동 저장 → 로그아웃 → 재로그인 → 불러오기를 가상 데이터로 확인합니다.
- SQL에서 확인한 RLS 격리를 두 실제 로그인 세션의 REST 요청으로도 확인합니다. B가 A의 `user_id`를 넣은 SELECT·UPDATE·DELETE 및 소유자를 바꾸는 INSERT·UPDATE가 거절되는지 검사합니다.
- 로그인된 각 계정은 자신의 행만 조회·수정·삭제할 수 있는지 확인합니다. 익명 REST 조회 거부는 이미 확인했으며 인증 설정 변경 시 재확인합니다.
- Supabase Advisors로 스키마·RLS·권한을 확인합니다. 실제 학생 자료 사용 전 접근권한·보유기간·외부 처리 조건을 확정합니다.

정적 코드 검사·빌드, DB 역할별 검증, 모의 인증 흐름, 실제 Google·이메일 인증과 브라우저 저장 검증을 구분해서 기록합니다. `supabase/schema.sql`은 이미 적용되어 있으므로 단순 배포 시 다시 실행하지 않습니다.
