# 담임노트

초등교사의 관찰 기록, 학기 말 점검, 나이스 입력 준비를 연결하는 웹앱입니다. v0.2는 가입·로그인 입구를 쉽게 찾고, 여러 학생의 기록을 이어서 남기는 흐름에 초점을 맞춥니다.

[배포된 앱](https://nicehelperys.vercel.app) · [공개 GitHub 저장소](https://github.com/gmlduqzhd-eng/Nice) · [배포·수정 안내](docs/DEPLOYMENT.md)

## 현재 사용할 수 있는 기능

- 가상 학생 8명과 관찰 12건으로 시작하는 업무 대시보드
- 관찰 기록 추가·수정·삭제, 학생·교과·내용 검색
- 시작 화면의 간단한 사용 안내와 ‘저장하고 다음 학생’ 연속 기록
- 빈 문장, 근거 누락, 중복 문장, 다른 학생 이름, 잘못 연결된 근거 점검
- 학생별 관찰 근거 선택 → 원문 모으기 → 교사 편집 → 검토 → 복사 → 반영 확인
- 문장이나 근거 변경 시 검토 상태 자동 초기화
- 브라우저 저장, JSON 백업·복원, 예시 데이터 초기화
- 나이스 학교 검색·월별 학사일정 API 및 연결 오류 안내
- 상단 ‘회원가입 · 로그인’에서 이메일 링크로 가입·로그인 통합, 재전송·이메일 변경·실패 안내
- 앱 시작 시 로그인 반환 처리, 내 계정 화면의 수동 백업과 소유자 전용 RLS
- 서비스 하단 저작권 표기와 저작권 안내

**실제 학생 개인정보를 입력하지 않는 가상 데이터 시제품입니다.** 나이스 내부에 로그인하거나 학생부를 자동 전송하지 않습니다. 문장 생성은 AI 호출 없이 선택한 관찰 원문을 모으는 방식입니다. 바이트 수는 UTF-8 참고값이며 나이스 입력 제한을 보증하지 않습니다.

## 선생님의 이용 순서

1. 로그인 없이 시작 안내를 따라 가상 학생의 관찰 기록을 남깁니다. 여러 학생을 기록할 때는 ‘저장하고 다음 학생’을 누르면 날짜·분류를 유지하며 다음 학생으로 넘어갑니다.
2. ‘나이스 입력 준비’에서 근거를 고르고 문장을 다듬은 뒤 검토·복사합니다. 나이스 화면에서 저장한 내용을 직접 확인한 다음 반영 확인을 누릅니다.
3. 기록은 현재 브라우저에 저장됩니다. 필요한 자료는 ‘설정 및 백업’에서 파일로 보관하고, 계정 백업은 로그인 후 직접 저장 버튼을 누릅니다.

**현재 이메일 로그인은 Supabase 조직 팀원 이메일을 사용하는 테스트 계정에 제한됩니다.** 일반 교사 대상 이메일 가입을 열려면 별도 SMTP 연결이 필요합니다. 현재 무료 프로젝트는 기본 메일 템플릿도 수정할 수 없어 인증번호 입력 방식 대신 기본 로그인 링크 방식을 사용합니다. Google 로그인 코드는 준비되어 있지만 공급자를 설정하지 않아 버튼은 꺼져 있습니다. 실제 메일 수신·로그인 및 로그인한 사용자의 원격 백업은 아직 검증하지 않았습니다. [연동 상태와 절차](docs/INTEGRATIONS.md)

## 실행

Node.js 24와 프로젝트에 고정된 pnpm 11.19.0을 사용합니다. 실제 개발·검증도 Node.js 24에서 수행했습니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

브라우저에서 http://127.0.0.1:3000 을 엽니다. 환경변수 없이 가상 데이터 기능을 이용할 수 있습니다.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

브라우저 검증은 Chrome이 설치된 환경에서 개발 서버를 실행한 뒤 `pnpm test:e2e`로 실행합니다.

## 나이스·Supabase 연결

`.env.example`을 `.env.local`로 복사하고 필요한 값을 설정한 뒤 서버를 재시작합니다.

| 환경변수 | 용도 |
| --- | --- |
| `NEIS_API_KEY` | 서버에서만 사용하는 나이스 공개 API 인증키 |
| `NEXT_PUBLIC_SUPABASE_URL` | 사용할 Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_`로 시작하는 공개 키 |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | 기본값 `false`. Google 공급자를 준비·검증한 뒤에만 `true`로 변경 |

Supabase 비밀 키나 service-role 키는 입력하지 않습니다. 구체적인 연결·SQL·인증 URL 설정은 [연동 안내](docs/INTEGRATIONS.md)를 참고하세요.

**2026-09-29 연결 상태:** GitHub `main`을 Vercel `nice_helper_ys`에 연결해 배포했고, Supabase `Nice` 프로젝트의 URL·공개 키 및 인증 반환 주소를 설정했습니다. `supabase/schema.sql`은 대시보드 SQL Editor에서 적용했으며 마이그레이션 이력 파일은 아닙니다. SQL 트랜잭션에서 소유자·타 사용자·익명 접근과 제약조건을 검증했고, 실제 익명 REST 요청의 접근 거부도 확인했습니다. **이메일 링크 로그인 → 브라우저 저장·불러오기는 아직 검증하지 않았습니다.** 나이스 운영 인증키도 미설정입니다. [검증 기록](docs/VERIFICATION.md)

## Vercel 배포 설정

1. 이 프로젝트 폴더를 Git 저장소로 관리하고 원하는 Vercel 프로젝트에 연결합니다.
2. 프레임워크를 Next.js로 설정합니다. Node.js는 `package.json`의 `24.x`를 사용하며, `vercel.json`은 서울 리전 `icn1`을 지정합니다.
3. Vercel 프로젝트의 미리보기·운영 환경변수에 `ENABLE_EXPERIMENTAL_COREPACK=1`을 등록합니다. Corepack이 `package.json`의 `packageManager`에 고정된 pnpm 11.19.0을 사용하도록 하는 필수 빌드 설정입니다. Install Command는 기본 자동 설정을 유지합니다. [Vercel Corepack 설정](https://vercel.com/docs/builds/configure-a-build#corepack)
4. 필요한 앱 환경변수만 개발·미리보기·운영 환경에 구분해 등록합니다.
5. Supabase 로그인 Redirect URLs에 실제 배포 주소를 등록합니다.
6. 가상 데이터로 연결을 검증한 미리보기부터 확인합니다.

현재 배포는 기존 Vercel·Supabase 프로젝트를 사용합니다. 이후 `main` 변경은 GitHub 연결을 통해 자동 배포됩니다. 같은 저장소에 연결된 다른 Vercel 프로젝트 `nice_helper`도 있으므로 배포 대상을 구분합니다. 상세 연결 현황과 수정 절차는 [배포 안내](docs/DEPLOYMENT.md)에 기록했습니다. 개인정보 실사용은 학교의 운영·위탁·보유기간·접근권한 조건을 확인한 후 별도 단계로 진행합니다.

## 계속 수정할 때

| 파일 | 책임 |
| --- | --- |
| `src/components/teacher-app.tsx` | 대시보드·관찰 노트·입력 준비 UI와 브라우저 저장 |
| `src/components/settings-panel.tsx` | JSON 백업·Supabase 수동 저장 |
| `src/components/auth-provider.tsx` | 공유 로그인 상태, 앱 시작 시 반환 처리·로그아웃 |
| `src/components/auth-dialog.tsx` | 이메일 가입·로그인 창, 재전송·선택적 Google 로그인 |
| `src/components/getting-started.tsx` | 로그인 없이 시작하는 간단한 사용 안내 |
| `src/components/school-panel.tsx` | 학교 검색·학사일정 UI |
| `src/lib/domain.ts` | 자료 검증, 업무 상태 전환, 점검 규칙 |
| `src/lib/demo.ts` | 가상 학급·예시 기록 |
| `src/app/api/neis/route.ts` | 서버에서 나이스 공개 API 조회 |
| `src/lib/supabase.ts` | 공개 키 기반 Supabase 클라이언트 |
| `src/lib/auth.ts` | 이메일 검증·재전송 시간·인증 오류 정리 |
| `src/lib/site.ts` | 서비스 저작권 표시 문구 |
| `supabase/schema.sql` | 2026-09-29 대시보드에서 적용한 백업 테이블 스키마. 마이그레이션 이력 아님 |
| `docs/PRODUCT.md` | 범위·다음 개발 순서·수용 기준 |
| `docs/DEPLOYMENT.md` | 연결된 프로젝트·배포 현황·Git 수정 흐름 |
| `docs/GOOGLE_AUTH.md` | 현재 꺼져 있는 Google 로그인 준비·검증 절차 |

데이터 형식은 `version: 1`입니다. 저장 구조를 변경할 때는 이전 백업을 읽는 변환 로직을 함께 작성합니다. 나이스 양식·기재 기준은 실물 예시를 확인한 뒤 추가하며, 현재 점검 결과는 공식 학생부 적합성 판정이 아닙니다.

## 알려진 범위 제한

- 학급 편성은 고정 가상 학급이며, 실제 학생 명부 가져오기는 아직 없습니다.
- 출결·증빙 첨부·평가 계획·교사 간 공유는 후속 개발 범위입니다.
- 클라우드는 교사 한 계정의 수동 스냅샷 백업입니다. 학교 조직 권한이나 실시간 공동 편집은 구현하지 않았습니다.
- 로그아웃하더라도 브라우저의 가상 데이터는 유지됩니다. 실제 학생 자료를 저장하는 인증 시스템으로 간주하면 안 됩니다.
- 같은 브라우저에서 여러 탭이 동시에 편집하는 충돌 처리는 후속 과제입니다.
- 글꼴은 Google Fonts에서 불러오며 연결이 없으면 시스템 글꼴을 사용합니다.

## 저작권 표시

화면 하단에 `© 2026 담임노트. All rights reserved.`를 표시합니다. 표시명을 변경할 때는 `src/lib/site.ts`를 수정합니다. 오픈소스 구성요소에는 각 구성요소의 라이선스가 적용됩니다. 교사가 작성한 관찰 기록은 서비스의 저작권 표기 대상에 포함하지 않습니다.

## 공식 자료

- [나이스 API 개발자 가이드](https://open.neis.go.kr/portal/guide/apiGuidePage.do)
- [학교생활기록부 종합지원포털](https://star.moe.go.kr/web/main/index.do)
- [Next.js](https://nextjs.org/docs)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vercel 배포](https://vercel.com/docs/deployments)
