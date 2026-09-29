import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '담임노트 · 선생님의 업무를 가볍게',
  description: '관찰 기록부터 학기 말 점검, 나이스 입력 준비까지 연결하는 초등교사 업무 공간',
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><a className="skip-link" href="#main-content">본문으로 바로가기</a>{children}</body></html>;
}
