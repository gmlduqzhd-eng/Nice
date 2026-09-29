# 검증 기록

검증일: 2026-09-29. 환경: Windows, Node.js 24, Next.js 16.3.6, Chrome headless.

| 범위 | 결과 |
| --- | --- |
| TypeScript | `pnpm typecheck` 통과 |
| 배포용 빌드 | `pnpm build` 통과 |
| 도메인 규칙 | 12개 테스트 통과 |
| 나이스 API 경계 | 14개 테스트 통과, 공식 응답 형태를 모의한 검사 |
| 브라우저 전체 흐름 | Playwright 10개 시나리오 통과 |
| 화면 확인 | 데스크톱 1440px, 모바일 390px에서 확인 |
| 기본 접근성 점검 | 대시보드 axe WCAG2 A/AA 자동검사에서 확정 위반 0건. 짧은 숫자·기호 7곳은 자동 판정 불가. 전체 접근성 인증을 의미하지 않음. |

## 브라우저에서 확인한 흐름

1. 화면·메뉴 이동 및 오류 없는 초기 표시
2. 학생을 지정해 관찰 추가, 새로고침 후 유지
3. 반영 확인한 문장 수정 시 검토 초기화
4. 근거 원문 모으기 → 검토 → 실제 클립보드 복사 → 교사 확인 → 재수정
5. 모바일 메뉴·입력 화면과 페이지 가로 넘침 방지
6. JSON 다운로드와 확인을 거친 복원
7. 손상·다른 형식·1MB 초과 백업 거부
8. 나이스 키가 없는 상황의 503 및 연결 대기 안내
9. 누락된 근거 연결 해제 후 새 관찰 연결·검토
10. 손상된 브라우저 저장 원문을 복구 파일로 다운로드

## 미검증 범위

- 운영 인증키를 사용한 실제 나이스 조회
- Supabase 실제 이메일 로그인과 브라우저의 저장·불러오기 전체 흐름
- 두 실제 로그인 세션의 REST 요청을 통한 RLS 격리. 아래 SQL 트랜잭션 검증과 구분
- Supabase Advisors 및 실제 사용자용 메일 전달 설정의 검토·검증
- 배포 환경의 전체 브라우저 시나리오. 아래 초기 설정 화면 확인과 구분
- 실제 학생 개인정보 취급 요건과 학교별 나이스 입력 양식

브라우저 테스트는 기본 가상 데이터와 미연결 환경을 전제로 한다. 실제 API 키를 넣은 환경에서 ‘미설정 503’ 시나리오는 별도의 테스트 서버로 실행해야 한다.

## GitHub·Vercel·Supabase 연결 확인

확인일: 2026-09-29. 연결 대상과 절차는 [배포 안내](DEPLOYMENT.md)에 기록했습니다. 기존 Vercel·Supabase 프로젝트를 사용했으며 아래 결과에 이메일 로그인 완료는 포함하지 않습니다.

| 범위 | 확인 결과 |
| --- | --- |
| GitHub | 공개 저장소 `gmlduqzhd-eng/Nice`의 `main`에 코드 푸시. 확인한 앱 커밋 `bc8a568` |
| 배포 | Vercel `nice_helper_ys`, `https://nicehelperys.vercel.app`, Ready 확인 |
| 빌드 설정 | 로그에서 Corepack의 pnpm 11.19.0 및 Next.js 16.3.6 사용 확인. Node.js 설정 `24.x` |
| 빌드 경고 | 개발 의존성 `agent-browser`가 빌드 서버에서 Chrome을 찾지 못한다는 경고. 앱 빌드·배포는 성공 |
| 배포 환경변수 | Supabase URL·publishable key와 `ENABLE_EXPERIMENTAL_COREPACK=1`을 All Environments에 설정 |
| 운영 HTTP | 무인증 GET에서 HTTP 200, 담임노트 제목, `X-Frame-Options: DENY` 확인 |
| 배포 UI | 대시보드·설정 화면 전환, 이메일 로그인 입력란 표시, 브라우저 콘솔 경고·오류 0건 |
| 배포 나이스 경로 | 실제 학교 조회 요청에서 HTTP 503 및 `NEIS_NOT_CONFIGURED` 확인. 인증키 미설정 상태를 정확히 표시 |
| DB 적용 | Supabase `Nice`(서울) 프로젝트에 대시보드 SQL Editor로 `supabase/schema.sql` 적용 성공. 적용 전 `public` 테이블 없음 확인 |
| DB 역할별 검증 | SQL 트랜잭션에서 소유자 CRUD, 타 사용자 조회·변경·삭제 차단, 소유자 변경 차단, 익명 권한 및 제약조건 검사 통과. 테스트 트랜잭션 롤백 및 Auth 사용자 목록 비어 있음 확인 |
| 익명 REST | 실제 네트워크 요청에서 HTTP 401 및 오류 코드 `42501` 확인 |
| Auth 설정 | Email 공급자 활성화·이메일 확인 필요. Site URL과 실제 배포·로컬 반환 주소 6개를 저장 후 재확인 |
| 로컬 재검증 | Node.js `24.x` 선언 수정 후 `pnpm typecheck`, `pnpm test` 26개, `pnpm build` 통과 |
| 로컬 연결 파일 | Supabase 공개 설정을 `.env.local`에, Vercel 연결 메타데이터를 `.vercel/project.json`에 작성. 두 파일 모두 Git 제외 |

확인 화면: [RLS 검증 캡처](images/supabase-rls-verified.png), [라이브 앱 캡처](images/damim-live.png). 재현용 SQL은 [`supabase/tests/rls-verification.sql`](../supabase/tests/rls-verification.sql)에 있으며 원격에서는 공백과 설명을 축약한 동등 SQL을 실행했습니다. SQL 역할별 검증은 실제 사용자 이메일 인증과 브라우저 세션을 사용하는 전체 흐름 검증과 별개입니다. 스키마 적용 기록은 이 문서와 SQL 주석에 남겼으며 Supabase CLI 마이그레이션 이력은 생성하지 않았습니다.
