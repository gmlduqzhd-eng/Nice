import type { Metadata } from 'next';
import PracticeEditor from './practice-editor';
import SemesterPracticeEditor from './semester-practice-editor';

export const metadata: Metadata = { title: '입력 도우미 연습 · 담임노트' };
export default async function NeisPracticePage({ searchParams }: { searchParams: Promise<{ task?: string | string[] }> }) {
  const { task } = await searchParams;
  return task === 'semester' ? <SemesterPracticeEditor/> : <PracticeEditor/>;
}
