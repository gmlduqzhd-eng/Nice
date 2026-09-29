import type { WorkspaceData } from "./domain";

/** Every person, observation and workflow state in this fixture is fictional. */
export const DEMO_WORKSPACE: WorkspaceData = {
  version: 2,
  classroom: { year: 2026, grade: 4, room: "2", semester: 2 },
  students: [
    { id: "student-1", number: 1, name: "강가람" },
    { id: "student-2", number: 2, name: "윤보라" },
    { id: "student-3", number: 3, name: "서하늘" },
    { id: "student-4", number: 4, name: "한도담" },
    { id: "student-5", number: 5, name: "임나래" },
    { id: "student-6", number: 6, name: "유초롱" },
    { id: "student-7", number: 7, name: "백아람" },
    { id: "student-8", number: 8, name: "오해솔" },
  ],
  observations: [
    { id: "observation-1", studentId: "student-1", date: "2026-09-22", category: "국어", content: "모둠 토의에서 친구의 의견을 메모해 공통된 의견 두 가지로 정리함." },
    { id: "observation-2", studentId: "student-1", date: "2026-09-25", category: "행동특성", content: "학급 책장 정리 중 분류가 어려운 책의 위치를 친구와 상의해 결정함." },
    { id: "observation-3", studentId: "student-2", date: "2026-09-23", category: "수학", content: "분수의 크기를 비교할 때 그림을 그려 자신의 풀이 과정을 설명함." },
    { id: "observation-4", studentId: "student-2", date: "2026-09-28", category: "국어", content: "이야기의 인물이 느낀 감정을 본문의 문장을 근거로 설명함." },
    { id: "observation-5", studentId: "student-3", date: "2026-09-21", category: "과학", content: "실험 전 예상과 관찰 결과가 다른 점을 찾아 실험 기록에 덧붙임." },
    { id: "observation-6", studentId: "student-3", date: "2026-09-24", category: "행동특성", content: "모둠에서 사용한 실험 도구의 수를 확인하고 정리 방법을 친구에게 안내함." },
    { id: "observation-7", studentId: "student-4", date: "2026-09-22", category: "사회", content: "마을 시설 조사에서 도서관과 공원의 역할을 비교해 발표함." },
    { id: "observation-8", studentId: "student-4", date: "2026-09-28", category: "행동특성", content: "모둠 활동에서 친구들의 역할을 확인하고 자료 정리를 맡아 끝까지 수행함." },
    { id: "observation-9", studentId: "student-5", date: "2026-09-24", category: "행동특성", content: "모둠 발표 준비에서 의견을 나누고 맡은 그림 자료를 정해진 시간에 완성함." },
    { id: "observation-10", studentId: "student-6", date: "2026-09-23", category: "미술", content: "주변에서 발견한 색과 모양을 활용해 작품을 만들고 표현 의도를 소개함." },
    { id: "observation-11", studentId: "student-6", date: "2026-09-25", category: "국어", content: "발표 원고를 읽어 보고 듣는 사람이 이해하기 어려운 문장을 스스로 고침." },
    { id: "observation-12", studentId: "student-7", date: "2026-09-28", category: "수학", content: "문제 해결에 필요한 정보를 표로 정리하고 계산 결과를 다시 확인함." },
  ],
  drafts: [
    { id: "draft-1", studentId: "student-1", content: "모둠 토의에서 친구들의 의견을 메모하고 공통된 내용을 정리하며 협력적으로 참여함.", evidenceIds: ["observation-1"], status: "confirmed", updatedAt: "2026-09-29T00:00:00.000Z" },
    { id: "draft-2", studentId: "student-2", content: "", evidenceIds: ["observation-3", "observation-4"], status: "draft", updatedAt: "2026-09-29T00:00:00.000Z" },
    { id: "draft-3", studentId: "student-3", content: "실험의 예상과 관찰 결과를 비교하고 차이점을 기록함.", evidenceIds: [], status: "draft", updatedAt: "2026-09-29T00:00:00.000Z" },
    { id: "draft-4", studentId: "student-4", content: "모둠 활동에서 친구들과 의견을 나누고 맡은 역할을 성실하게 수행함.", evidenceIds: ["observation-8"], status: "reviewed", updatedAt: "2026-09-29T00:00:00.000Z" },
    { id: "draft-5", studentId: "student-5", content: "모둠 활동에서 친구들과 의견을 나누고 맡은 역할을 성실하게 수행함.", evidenceIds: ["observation-9"], status: "draft", updatedAt: "2026-09-29T00:00:00.000Z" },
    { id: "draft-6", studentId: "student-6", content: "백아람은 주변의 색과 모양을 작품에 활용하고 표현 의도를 설명함.", evidenceIds: ["observation-10"], status: "draft", updatedAt: "2026-09-29T00:00:00.000Z" },
    { id: "draft-7", studentId: "student-7", content: "문제 해결에 필요한 정보를 표로 정리하고 계산 결과를 다시 확인하는 습관을 보임.", evidenceIds: ["observation-12"], status: "copied", updatedAt: "2026-09-29T00:00:00.000Z" },
    { id: "draft-8", studentId: "student-8", content: "학급 활동에 참여하며 자신이 맡은 역할을 확인함.", evidenceIds: ["removed-observation-example"], status: "draft", updatedAt: "2026-09-29T00:00:00.000Z" },
  ],
};

export function createDemoWorkspace(): WorkspaceData {
  return JSON.parse(JSON.stringify(DEMO_WORKSPACE)) as WorkspaceData;
}
