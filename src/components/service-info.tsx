import Link from "next/link";
import type { ReactNode } from "react";
import { COPYRIGHT } from "@/lib/site";
import styles from "./service-info.module.css";

export default function ServiceInfo({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>담임노트</Link>
        <Link href="/" className={styles.home}>홈으로 돌아가기 <span aria-hidden="true">→</span></Link>
      </header>
      <main id="main-content" className={styles.main}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>가상 학급 체험판 · 서비스 안내</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          <span className={styles.updated}>기준일 <time dateTime="2026-09-29">2026년 9월 29일</time></span>
        </div>
        <article className={styles.article}>{children}</article>
      </main>
      <footer className={styles.footer}>
        <nav aria-label="서비스 안내"><Link href="/privacy">개인정보 처리방침</Link><Link href="/terms">이용약관</Link><a href="mailto:gmlduqzhd@gmail.com">문의하기</a></nav>
        <p>{COPYRIGHT}</p>
      </footer>
    </div>
  );
}
