# Google 로그인 연결과 검증

현재 상태는 **Google 앱 Production 전환 완료 / 일반 Chrome 실제 로그인 확인 / 가상 자료 클라우드 저장·같은 브라우저 복원 확인**입니다. 다른 브라우저의 불러오기 성공 안내는 사용자가 확인했습니다. 복원 원문의 직접 대조, 다른 PC 확인과 실제 두 계정의 접근 격리는 별도 검증이 필요합니다. 메일 발송 서비스 없이 Google 계정 선택으로 가입과 로그인을 함께 처리하도록 구현했습니다. [최신 검증 결과](VERIFICATION.md)

## 2026-09-29 22:33 KST 실제 사용 확인

사용자가 운영 앱에서 Google 로그인을 완료한 뒤 ‘내 계정’과 ‘로그인됨’을 확인했습니다. 기존 클라우드 백업이 없는 계정에 가상 학생 8명·관찰 13건을 수동 저장했고, 브라우저에서 검증용 관찰을 임시 변경한 뒤 클라우드에서 원문을 복원했습니다. 저장 시각은 `2026-09-29 22:32:56 KST`입니다. 실제 사용자 인증을 이용한 저장·복원 결과이며 아래 모의 테스트 및 이전 브라우저 오류 관측과 구분합니다. 로그아웃·재로그인, 독립 브라우저의 복원 내용 직접 대조, 두 실제 계정의 접근 격리와 이메일 인증은 아직 확인하지 않았습니다.

## 사용할 인증 방식

Google Identity Services(GIS)의 공식 버튼이 발급한 ID token을 브라우저 callback에서 Supabase `signInWithIdToken({ provider: "google", token, nonce })`에 전달합니다. Supabase가 Google 토큰을 검증한 뒤 앱의 사용자 세션을 발급합니다. 앱은 Google 비밀번호를 받거나 토큰 내용을 직접 신뢰해 로그인 상태를 만들지 않습니다. [Supabase GIS 통합 안내](https://supabase.com/docs/guides/auth/social-login/auth-google#google-pre-built)

이 흐름은 **공개 Client ID**를 앱과 Supabase에 설정하며 Google Client Secret을 사용하지 않습니다. Client ID는 앱 식별자이고 비밀 인증키가 아닙니다. 공식 Supabase Studio의 Google 공급자 검증 스키마는 활성 상태의 Client ID를 필수로, Secret을 선택값으로 정의합니다. Google ID token 처리 경로도 공급자 활성화 상태와 허용 Client ID, 서명·issuer·audience·nonce를 검사합니다. [Studio 설정 스키마](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Auth/AuthProvidersFormValidation.tsx), [Auth ID token 처리](https://github.com/supabase/auth/blob/master/internal/api/token_oidc.go)

기존 `signInWithOAuth`는 별도의 redirect·authorization code 교환 방식이며 Client Secret이 필요합니다. GIS 전환 후에는 Secret이 없는 상태에서 그 경로를 fallback으로 호출하지 않습니다. Google 로그인 가이드의 공통 설정 예시는 Secret까지 등록하지만, 이 앱에서 선택한 방식은 같은 가이드의 GIS ID token 흐름입니다.

## 2026-09-29 확인한 설정과 남은 검증

- Google Cloud 프로젝트: `My Project 36646` (`refined-graph-510101-c2`). 기존 프로젝트를 사용합니다.
- Google 인증 플랫폼 앱 이름: `담임노트`, 대상: 외부, 현재 게시 상태: `Production`. 아래 추가 확인 기록을 참고합니다.
- 웹 OAuth 클라이언트 `담임노트 웹 로그인`과 아래 운영 JavaScript origin을 등록했습니다.
- Supabase Google 공급자는 **Client ID 등록·Secret 빈값**으로 저장했고 공개 Auth 설정에서 `google: true`를 확인했습니다. nonce 검사 생략은 사용하지 않습니다.
- GIS 구현의 단위 테스트 31개, 타입 검사, Google 표시가 켜진 운영 빌드가 통과했습니다. 켜진 빌드에서 인증 브라우저 9개·앱 12개, 꺼진 설정에서 인증 7개가 통과했고 Google 전용 2개는 제외했습니다. 브라우저 인증은 외부 요청을 차단한 모의 검증입니다.
- 커밋 `d4bd638`의 Vercel `nice_helper_ys` 배포가 Ready인 것을 확인했습니다. 운영 앱 `https://nicehelperys.vercel.app`에서 Google 공식 한국어 버튼이 표시됐습니다. 운영 Client ID와 `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`를 빌드에 반영했습니다.
- `/privacy`, `/terms`는 로그인 없이 HTTP 200으로 열렸고 페이지 제목을 확인했습니다. Google Branding에 홈페이지·개인정보처리방침·약관 URL을 저장한 성공 알림을 확인했습니다.
- 직전 확인 이력: Google 버튼 클릭 중 Chrome 연결이 끊겼고 재연결 후에도 자동화 목록에서 Chrome을 확인하지 못했습니다. 이 시점의 Google 앱 상태는 Testing이었으며, 이후 아래와 같이 공개 설정을 완료했습니다.
- 기본 SMTP의 조직 팀원 제한은 그대로입니다. Google 설정 변경이 일반 사용자에게 이메일 로그인을 열어 주지는 않습니다.

이전에 Google 버튼이 켜진 빌드와 꺼진 개발 서버에서 각각 인증 브라우저 시나리오 7개를 통과한 기록은 **기존 OAuth redirect 구현의 모의 검증**입니다. GIS 구현이나 실제 Google 인증 교환의 검증 결과로 재사용하지 않습니다. 이후 결과는 [검증 기록](VERIFICATION.md)을 확인합니다.

## 2026-09-29 이전 확인: 공개 전환 완료, 당시 실제 인증 미검증

- Codex 내장 브라우저의 기존 Google 계정 세션으로 대상 Google Cloud 프로젝트에 다시 접속했습니다. Audience에서 앱 게시를 진행한 뒤 **‘프로덕션 단계’와 ‘테스트로 돌아가기’**가 표시되는 것을 확인했습니다.
- 인증 센터의 Data access status에서 **민감하거나 제한된 범위를 요청하지 않으므로 인증이 필요 없다는 안내**를 확인했습니다. Brand는 **‘브랜딩이 사용자에게 표시되고 있지 않음’** 상태이며, 앱 이름·로고 표시용 브랜드 검증은 진행하지 않았습니다. 앱 게시와 브랜드 검증은 별도 상태입니다.
- 운영 앱의 실제 Google 공식 iframe 버튼을 Codex 내장 브라우저에서 클릭한 뒤 콘솔에 `[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token.`이 나타났습니다. 오류 원인은 확정하지 않았습니다. 이 관측만으로 일반 브라우저에서도 실패한다고 판단하지 않습니다.
- Chrome은 자동화 목록에서 여전히 확인되지 않았습니다. **일반 브라우저에서 계정 선택·Supabase 인증 → 가상 자료 수동 저장 → 로그아웃·재로그인 → 불러오기를 확인해야 합니다.** 실제 인증과 원격 백업 성공은 아직 기록할 수 없으며, Client Secret 수동 입력은 필요하지 않습니다.

## 주소와 환경변수

| 설정 | 값·용도 |
| --- | --- |
| 앱 origin·Supabase Site URL | `https://nicehelperys.vercel.app` |
| Google Authorized JavaScript origins | `https://nicehelperys.vercel.app` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google 웹 클라이언트의 공개 Client ID. Supabase에 등록한 값과 일치해야 함 |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | 기본 `false`. 대상 환경에서 버튼을 시험·운영할 때 `true`로 빌드 |

GIS의 popup·JavaScript callback 방식은 앱의 새 redirect endpoint가 필요하지 않습니다. 기존에 등록한 `https://zskqtnweoiskgbdnraue.supabase.co/auth/v1/callback`은 OAuth redirect용 주소이며 GIS callback의 목적지가 아닙니다. Supabase의 기존 Site URL·이메일 반환 허용 주소는 유지합니다. [Google GIS 설정](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

로컬이나 미리보기에서 실제 GIS를 시험하려면 **그 환경의 정확한 origin**도 Google 웹 클라이언트에 등록해야 합니다. 운영 origin 등록은 Vercel의 다른 미리보기 주소를 자동 허용하지 않습니다. Google의 로컬 설정 안내는 `http://localhost`와 사용할 포트의 origin을 함께 추가하도록 안내합니다. 이메일 링크도 시험한다면 Supabase의 해당 반환 허용 주소를 별도로 확인합니다.

두 Google 환경변수는 빌드 때 브라우저 코드에 포함됩니다. `.env.local` 변경 시 개발 서버를 다시 시작하고, Vercel 값 변경 시 해당 환경을 다시 배포합니다. `.env.example`에는 이름과 빈값만 두며 실제 Client ID를 문서에 복제하지 않습니다. Client Secret, ID token, 액세스·갱신 토큰은 소스·로그·채팅·공개 환경변수에 넣지 않습니다.

## GIS 구현 기준

1. 공식 `https://accounts.google.com/gsi/client` 스크립트를 로그인 UI에서 한 번 로드하고 공식 `renderButton`을 사용합니다. 한국어 표시와 popup callback 방식으로 계정 선택을 제공합니다. 자동 One Tap은 별도로 추가·검증하기 전에는 사용하지 않습니다.
2. 인증 시도마다 암호학적으로 안전한 nonce 원문을 생성합니다. GIS에는 원문의 SHA-256 hex, Supabase에는 원문을 전달합니다. nonce 검사 생략을 켜거나 고정 nonce를 사용하지 않습니다.
3. token callback부터 Supabase 교환 종료까지 중복 처리를 막습니다. 대화상자가 닫혔거나 시도가 바뀐 뒤 도착한 callback은 처리하지 않습니다. Google 창을 취소해도 앱이 로딩 상태에 갇히지 않아야 합니다.
4. GIS 스크립트·교환 실패는 한국어로 안내하고 체험 기능으로 돌아갈 수 있게 합니다. 원문 오류와 토큰을 화면에 노출하지 않습니다.
5. `use_fedcm_for_button` 등은 현재 [Google JS API](https://developers.google.com/identity/gsi/web/reference/js-reference)를 따릅니다. `use_fedcm_for_prompt`는 현재 deprecated되어 무시되므로 활성화 여부를 제어하는 값으로 사용하지 않습니다.

CSP를 사용하는 경우 GIS의 script·frame·connect·style 주소와 Supabase 연결 주소를 허용해야 합니다. popup과 COOP 설정의 호환성도 확인합니다. 현재 설정을 바꿀 때는 [Google 보안 헤더 안내](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy)에 맞춰 검증합니다.

## 공개와 실제 사용자 흐름 확인

Google의 기본 신원 범위인 `openid`, 이메일, 기본 프로필만 요청합니다. Gmail·Drive·Calendar 권한이나 오프라인 접근은 필요하지 않습니다. 이 범위만 요청하는 로그인은 Testing 사용자 allowlist와 7일 인증 만료 제한의 예외지만, 학교 Workspace 관리자가 외부 앱을 제한할 수 있습니다. [Google Audience 안내](https://support.google.com/cloud/answer/15549945?hl=en)

홈페이지·개인정보처리방침·약관 URL을 저장했고 Audience의 Production 전환을 확인했습니다. 기본 인증 범위의 데이터 접근 심사는 필요 없다고 인증 센터에서 확인했습니다. 일반 Chrome의 실제 로그인과 같은 브라우저 백업·복원은 확인했으며, 독립 브라우저의 복원 내용 직접 대조와 실제 두 계정의 격리가 남아 있습니다. 앱 이름·로고를 Google 동의 화면에 표시하려면 별도 브랜드 검증이 필요합니다. 미검증 브랜드는 앱 도메인으로 표시되며, 현재 기본 로그인 확인의 선행조건으로 도메인 구매나 브랜드 심사를 추가하지 않습니다. [Google Branding 안내](https://support.google.com/cloud/answer/15549049?hl=en), [브랜드 검증 조건](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

대상 빌드에서 버튼 표시 → 계정 선택·동의 → 앱의 ‘내 계정’ 표시 → 명시적인 가상 자료 백업 → 로그아웃 → 재로그인·불러오기를 확인합니다. 취소·거부·네트워크 실패 후 재시도와 다른 계정 자료 접근 차단도 확인합니다. 로그인만으로 관찰 기록을 업로드해서는 안 됩니다.

모의 테스트에서는 GIS 스크립트와 Supabase ID token 교환 요청을 가로채 외부로 보내지 않습니다. nonce 연결, 중복·늦은 callback, 로그인 상태 갱신을 검증합니다. 모의 테스트와 실제 Google 인증 결과를 별도로 기록합니다. 운영 환경변수를 설정하거나 Vercel 배포가 Ready여도 실제 인증 교환과 백업 검증을 완료했다고 표현하지 않습니다.
