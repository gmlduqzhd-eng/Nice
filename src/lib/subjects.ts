/** Shared teacher-facing elementary subjects; custom legacy categories remain readable. */
export const ELEMENTARY_SUBJECTS = [
  '국어', '수학', '사회', '도덕', '과학', '실과', '체육', '음악', '미술', '영어',
  '바른 생활', '슬기로운 생활', '즐거운 생활',
] as const;

export const OBSERVATION_CATEGORIES = ['행동 관찰', ...ELEMENTARY_SUBJECTS, '창의적 체험활동'] as const;
