# Google 로그인 연결 준비

현재 상태는 **Google OAuth 앱·클라이언트 생성 완료 / Supabase 인증키 입력 대기 / 운영 버튼 표시 꺼짐 / 실제 로그인 미검증**입니다. 메일 서비스나 구매한 도메인이 없어도 현재 Vercel 앱 주소와 Supabase 반환 주소를 사용해 Google 로그인을 설정할 수 있습니다. Google 동의 화면에는 Supabase 프로젝트 주소가 표시될 수 있습니다. [Supabase의 Google 설정 안내](https://supabase.com/docs/guides/auth/social-login/auth-google)

## 2026-09-29 준비 현황

- Google Cloud 프로젝트: `My Project 36646` (`refined-graph-510101-c2`). 사용자가 만든 프로젝트를 이어서 사용합니다.
- Google 인증 플랫폼 앱 이름: `담임노트`, 대상: 외부. 사용자 확인 후 Google API 사용자 데이터 정책에 동의하고 앱 구성을 생성했습니다.
- 웹 OAuth 클라이언트 `담임노트 웹 로그인`을 생성했고 아래 운영 origin과 Supabase 콜백을 등록했습니다.
- Client Secret은 저장소·문서·환경변수에 저장하지 않았습니다. 사용자가 Google 화면에서 복사해 Supabase Google 설정에 직접 입력하고 저장해야 합니다.
- Supabase 공개 Auth 설정 조회에서 Google 비활성화를 확인했습니다. 키 저장 후 다시 확인해야 합니다.
- Google 게시 상태는 테스트 중입니다. 일반 사용자 공개 전 브랜딩·게시 설정과 실제 로그인 동작을 확인합니다.
- Google 버튼이 켜진 빌드와 꺼진 개발 서버에서 인증 브라우저 시나리오 각각 7개를 통과했습니다. 외부 요청은 모의 응답으로 차단했으며 실제 Google 인증 교환 검증은 아닙니다.

## 사용할 주소

| 설정 | 정확한 값 |
| --- | --- |
| 앱 origin·Supabase Site URL | `https://nicehelperys.vercel.app` |
| Google Authorized JavaScript origins | `https://nicehelperys.vercel.app` |
| Google Authorized redirect URIs | `https://zskqtnweoiskgbdnraue.supabase.co/auth/v1/callback` |
| Supabase Redirect URLs | `https://nicehelperys.vercel.app`와 `https://nicehelperys.vercel.app/` |

Google의 redirect URI는 Supabase 콜백이고, Supabase의 반환 허용 주소는 담임노트 앱입니다. 로컬 앱을 별도 시험하려면 `http://localhost:3000` 또는 `http://127.0.0.1:3000`을 해당 origin·Supabase 반환 허용 목록에 추가합니다. 로컬 앱이 현재 원격 Supabase 프로젝트를 사용한다면 Google 콜백은 위 원격 주소 그대로입니다.

## 설정 순서

1. [Google Cloud Console](https://console.cloud.google.com/)에서 사용할 프로젝트를 선택하고 Google Auth Platform의 앱 이름·지원 이메일·대상을 설정합니다. 테스트 상태라면 사용할 테스트 계정을 등록합니다.
2. Data Access 권한은 로그인에 필요한 `openid`, 이메일, 기본 프로필로 제한합니다. Gmail·Drive·Calendar 접근이나 오프라인 접근은 담임노트 로그인에 필요하지 않습니다.
3. Clients에서 Web application OAuth 클라이언트를 준비하고 표의 origin·redirect URI를 등록합니다.
4. [현재 Supabase 프로젝트](https://supabase.com/dashboard/project/zskqtnweoiskgbdnraue)의 Authentication → Sign In / Providers → Google에서 Client ID와 Client Secret을 입력하고 활성화합니다. **Client Secret은 사용자가 이 설정 화면에 직접 입력합니다. 코드·GitHub·채팅·`NEXT_PUBLIC_` 환경변수에는 넣지 않습니다.** 앱에는 Google Secret이나 별도 Google Client ID 환경변수가 필요하지 않습니다.
5. Supabase URL Configuration에서 표의 Site URL과 반환 주소를 확인합니다. 위 순서는 [공식 Google 공급자 설정](https://supabase.com/docs/guides/auth/social-login/auth-google)에 따릅니다.

## 버튼을 켜고 확인하기

현재 `.env.example`의 `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false`를 유지합니다. 공급자 설정을 마친 뒤 신뢰하는 로컬·미리보기 환경에서만 `true`로 바꾸고 다시 빌드해 로그인 흐름을 시험합니다. 미리보기 주소를 사용하면 그 주소도 반환 허용 목록에 등록해야 합니다.

확인할 흐름은 Google로 계속하기 → 계정 선택·동의 → 앱 복귀 → ‘내 계정’ 표시 → 명시적인 가상 자료 백업 → 로그아웃 → 재로그인·불러오기입니다. 취소·거부 후 재시도와 다른 계정 자료 접근 차단도 확인합니다. 로그인만으로 자료를 업로드해서는 안 됩니다. 테스트 결과가 확인되면 Vercel `nice_helper_ys`의 운영 환경에서 플래그를 `true`로 바꾸고 재배포합니다. 공개 환경변수는 빌드에 포함되므로 재배포가 필요합니다.

문서 작성이나 환경변수 이름 추가는 공급자 연결·인증 성공을 뜻하지 않습니다. 실제 확인 결과는 [검증 기록](VERIFICATION.md)에 따로 남깁니다. 이메일 로그인은 별도 SMTP 연결 전까지 조직 팀원 제한이 유지됩니다.
