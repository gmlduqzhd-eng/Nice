import type { Metadata } from "next";
import ServiceInfo from "@/components/service-info";

export const metadata: Metadata = {
  title: "개인정보 처리방침 · 담임노트",
  description: "담임노트의 로그인 정보, 브라우저 기록, 선택한 클라우드 백업과 삭제 요청 방법을 안내합니다.",
};

export default function PrivacyPage() {
  return (
    <ServiceInfo title="개인정보 처리방침" intro="어떤 정보를 쓰고 어디에 저장하는지, 삭제를 원할 때 어떻게 요청하는지 안내합니다.">
      <section>
        <h2>1. 서비스와 문의처</h2>
        <p>운영 표시명은 <strong>담임노트</strong>입니다. 개인정보 관련 문의와 계정·백업 삭제 요청은 <a href="mailto:gmlduqzhd@gmail.com">gmlduqzhd@gmail.com</a>으로 받습니다.</p>
        <p>현재는 가상 학생으로 업무 흐름을 연습하는 체험판입니다. <strong>실제 학생의 이름, 연락처, 건강 정보 등 개인정보를 입력하거나 백업하지 마세요.</strong></p>
      </section>
      <section>
        <h2>2. 사용하는 정보와 목적</h2>
        <table>
          <thead><tr><th scope="col">정보</th><th scope="col">사용 목적과 처리 방식</th></tr></thead>
          <tbody>
            <tr><td>로그인 계정</td><td>이메일 주소와 계정 식별자를 가입·로그인 및 계정별 백업 구분에 사용합니다. Google 로그인 시 Google이 제공하는 식별자, 이메일, 이름, 프로필 사진 주소를 Supabase Auth에서 계정 정보로 처리할 수 있습니다.</td></tr>
            <tr><td>로그인 세션</td><td>세션과 인증 토큰은 로그인 유지·사용자 확인을 위해 Supabase Auth와 사용 중인 기기의 브라우저에서 관리합니다.</td></tr>
            <tr><td>연습 기록</td><td>가상 학생 정보, 관찰 내용·날짜·분류, 작성 문장과 검토 상태를 기록·점검·입력 준비에 사용합니다. 기본 저장 위치는 현재 기기의 브라우저입니다.</td></tr>
            <tr><td>선택한 백업</td><td>‘클라우드에 저장’을 누르고 저장을 확인하면 계정 식별자, 연습 기록 전체와 저장 시각을 계정별 백업에 사용합니다.</td></tr>
            <tr><td>AI 문장 생성</td><td>‘AI 생성’을 누르면 문장 칸의 키워드·내용, 함께 반영하기로 선택한 관찰 근거, 요청 분량을 앱 서버를 거쳐 Google Gemini API로 전송합니다. 명부에 등록된 이름은 브라우저에서 가리며, 학생 번호·학급 명부·계정 이메일을 생성 자료에 추가하지 않습니다. 임의로 적은 개인정보가 모두 제거되는 것은 아닙니다.</td></tr>
            <tr><td>입력 도우미 작업 파일</td><td>직접 선택한 학생 번호·이름·문장과 학급 정보가 기기에 내려받은 JSON 파일에 포함됩니다. 확장프로그램은 사용자가 연 파일과 지정한 화면 항목을 브라우저 메모리에서 대조하며 별도 서버로 전송하거나 영구 저장하지 않습니다.</td></tr>
          </tbody>
        </table>
        <p>Google 로그인에는 기본 계정 확인만 사용합니다. Gmail 메일함, Drive 파일, Calendar 일정 등의 추가 접근 권한을 요청하지 않습니다. Google 비밀번호를 담임노트에 입력하지 않습니다.</p>
      </section>
      <section>
        <h2>3. 기록의 저장 위치</h2>
        <p><strong>로그인만으로 연습 기록을 업로드하지 않습니다.</strong> 클라우드 백업은 사용자가 저장 버튼을 선택하고 확인할 때만 전송합니다. 백업 데이터베이스는 서울 리전의 Supabase 프로젝트를 사용합니다.</p>
        <p>브라우저 기록과 클라우드 백업은 서로 별개입니다. 다른 기기에서 자동으로 동기화하지 않으며, 클라우드에서 불러오기를 선택해야 해당 백업을 가져옵니다. 브라우저 안에서는 로그인 계정별 기록 공간을 구분합니다. 로그아웃하면 로그인 전 체험 공간으로 돌아가며 계정 기록은 다음 로그인 시 다시 열 수 있습니다. 이 구분은 브라우저 저장 자료를 암호화하는 기능이 아닙니다.</p>
        <p>AI 생성 결과는 미리보기로 표시되고 ‘이 문장 적용’을 눌러야 브라우저 기록을 바꿉니다. 앱의 백업 데이터베이스에 생성 요청을 자동 저장하지 않습니다. <strong>Gemini 무료 API에서는 입력과 출력이 Google의 제품 개선에 사용될 수 있으므로 가상 자료만 사용하세요.</strong> 외부 서비스에서의 처리·보관은 해당 서비스 정책을 따릅니다.</p>
      </section>
      <section>
        <h2>4. 보관과 삭제 요청</h2>
        <p>브라우저의 기록은 해당 사이트 데이터를 지울 때까지 남을 수 있습니다. 공용 기기에서는 사용을 마친 뒤 로그아웃하고 브라우저 설정에서 담임노트의 사이트 데이터를 삭제해 주세요. 따로 내려받은 백업 파일도 직접 관리해야 합니다.</p>
        <p>입력 도우미는 닫기·새로고침 시 읽은 작업 파일과 화면 지정을 메모리에서 해제합니다. 내려받은 작업 파일은 별도로 삭제해야 합니다. 대상 화면에 입력한 내용과 대상 서비스에서의 처리는 도우미를 닫아도 취소되지 않습니다.</p>
        <p><strong>현재 계정과 클라우드 백업을 기간에 따라 자동 삭제하는 기능은 없습니다.</strong> 앱에서 새 백업을 저장하면 해당 계정의 기존 백업을 대체합니다. 브라우저 기록 삭제나 로그아웃은 서버의 계정·백업 삭제가 아닙니다.</p>
        <p>계정·백업의 확인, 정정, 삭제 또는 이용 중단을 원하면 <a href="mailto:gmlduqzhd@gmail.com">문의 이메일</a>로 사용한 계정 이메일과 요청 내용을 보내 주세요. 운영자가 계정 소유 여부와 요청 대상을 확인한 뒤 처리하고 결과를 안내합니다. 비밀번호, 인증 토큰, 실제 학생 자료는 보내지 마세요.</p>
      </section>
      <section>
        <h2>5. 함께 사용하는 외부 서비스</h2>
        <ul>
          <li><strong>Google</strong>은 사용자가 선택한 Google 로그인을 처리합니다. 로그인 창을 열면 Google 로그인 버튼을 불러오기 위한 접속 요청이 전송됩니다. 또한 화면 글꼴을 Google Fonts에서 불러오므로 글꼴 요청과 접속 정보가 Google에 전달될 수 있습니다. <a href="https://policies.google.com/privacy?hl=ko" target="_blank" rel="noreferrer">Google 개인정보처리방침</a></li>
          <li><strong>Supabase</strong>는 계정 인증과 사용자가 저장한 클라우드 백업을 처리합니다. <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase 개인정보처리방침</a></li>
          <li><strong>Google Gemini API</strong>는 요청한 AI 초안을 생성합니다. 무료·유료 이용에 따른 데이터 사용 조건은 <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini API 추가 약관</a>과 <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">무료 이용 안내</a>에서 확인할 수 있습니다.</li>
          <li><strong>Vercel</strong>은 웹앱을 제공하고 앱의 서버 요청을 처리합니다. 서비스 제공·보안·오류 확인 과정에서 접속 IP, 브라우저 정보, 요청 기록 등이 처리될 수 있습니다. <a href="https://vercel.com/legal/privacy-notice" target="_blank" rel="noreferrer">Vercel 개인정보처리방침</a></li>
        </ul>
        <p>서울 리전 표시는 백업 데이터베이스의 위치를 뜻합니다. 외부 서비스의 인증·접속 정보 처리 범위는 각 서비스의 정책에서도 확인할 수 있습니다.</p>
      </section>
      <section>
        <h2>6. 안내의 변경</h2>
        <p>정보를 사용하는 목적이나 저장 방식이 바뀌면 이 페이지의 내용과 기준일을 갱신합니다. 서비스 이용 조건은 <a href="/terms">이용약관</a>에서 확인할 수 있습니다.</p>
      </section>
    </ServiceInfo>
  );
}
