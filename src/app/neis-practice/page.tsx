import type { Metadata } from 'next';
import PracticeEditor from './practice-editor';

export const metadata: Metadata = { title: '입력 도우미 연습 · 담임노트' };
export default function NeisPracticePage() { return <PracticeEditor/>; }
