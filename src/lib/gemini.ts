import {
  GoogleGenerativeAI,
  type Content,
  type GenerationConfig,
} from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import fs from "node:fs";
import path from "node:path";
import { COACHES, HEAD_COACH, type CoachPersona } from "./coaches";
import {
  extractKeyFrames,
  type ExtractedFrame,
  type PhaseTimestamps,
} from "./frames";
import {
  BODY_REGION_LABEL,
  CLUB_LABEL,
  GRADE_LABEL,
  MECHANICS_DIMENSIONS,
  MECHANICS_LABEL,
  VIDEO_VIEW_LABEL,
  scoreToGradeLevel,
} from "./types";
import type {
  BodyRegion,
  ClubType,
  Grade,
  HomeworkCheck,
  Level,
  MechanicsDim,
  MechanicsScore,
  RegionReport,
  ReviewBreakdown,
  ReviewResult,
  SwingAnalysis,
  SwingFocus,
  SwingPoint,
  VideoView,
} from "./types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const MAX_REVIEW_ATTEMPTS = 3;
const PASS_THRESHOLD = 90;

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.");
  return k;
}

// ---------- 클럽 인식: 정형 관찰 매핑 + 가중치 ----------
// LLM의 clubScores 출력은 신뢰하지 않고, clubObservations만 받아서
// 서버가 가중 투표로 결정한다. 같은 관찰이면 항상 같은 클럽으로 분류.

type ClubOrNull = ClubType | null;

const OBSERVATION_TO_CLUB: Record<string, Record<string, ClubOrNull>> = {
  tee: {
    "높은 티": "driver",
    "낮은 티": "iron",
    "티 없음": null, // 한국 스크린골프 환경에선 iron/approach 모두 가능 → 다른 단서로 결정
    "관찰 불가": null,
  },
  ballPosition: {
    "앞발 안쪽": "driver",
    "스탠스 중앙-약간 왼쪽": "iron",
    "스탠스 중앙/뒤": "approach",
    "관찰 불가": null,
  },
  stanceWidth: {
    "어깨보다 넓음": "driver",
    "어깨 너비": "iron",
    "어깨보다 좁음": "approach",
    "관찰 불가": null,
  },
  spineAngle: {
    "거의 수직": "driver",
    "중간 정도 숙임": "iron",
    "많이 숙임": "approach",
    "관찰 불가": null,
  },
  clubLength: {
    "긴 편": "driver",
    중간: "iron",
    짧음: "approach",
    "관찰 불가": null,
  },
  headShape: {
    "큰 둥근 헤드": "driver",
    "얇은 블레이드": "iron",
    "누운 큰 로프트 면": "approach",
    "관찰 불가": null,
  },
  swingArc: {
    "큰 호": "driver",
    중간: "iron",
    "컴팩트한 작은 호": "approach",
    "관찰 불가": null,
  },
  swingTempo: {
    "느리고 부드러움": "driver",
    중간: "iron",
    "짧고 빠름": "approach",
    "관찰 불가": null,
  },
};

const OBSERVATION_WEIGHTS: Record<string, number> = {
  // 결정적 단서 (헤드 자체를 보는 것)
  headShape: 3,
  clubLength: 3,
  // 강한 단서 (어드레스의 기하학)
  tee: 2,
  ballPosition: 2,
  // 보조 단서 (간접 추정)
  stanceWidth: 1,
  spineAngle: 1,
  swingArc: 1,
  swingTempo: 1,
};
// 최대 가중 합계 = 3+3+2+2+1+1+1+1 = 14점

function classifyClubFromObservations(
  observations: Record<string, string> | null | undefined,
): {
  clubType: ClubType;
  scores: Record<ClubType, number>;
  confidence: number;
  observedCount: number;
} | null {
  if (!observations) return null;
  const scores: Record<ClubType, number> = { driver: 0, iron: 0, approach: 0 };
  let totalWeight = 0;
  let observedCount = 0;
  for (const key of Object.keys(OBSERVATION_WEIGHTS)) {
    const value = observations[key];
    if (!value || value === "관찰 불가") continue;
    const club = OBSERVATION_TO_CLUB[key]?.[value];
    if (!club) continue; // "티 없음" 같은 null 매핑은 카운트 안 함
    const w = OBSERVATION_WEIGHTS[key];
    scores[club] += w;
    totalWeight += w;
    observedCount += 1;
  }
  if (totalWeight === 0) return null;

  const sorted = (Object.entries(scores) as [ClubType, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const winner = sorted[0][0];
  const margin = sorted[0][1] - sorted[1][1];

  // 신뢰도: 마진 + 관찰량으로 산출 (마진 비례, 관찰 부족 시 디스카운트)
  let confidence: number;
  if (margin >= 6) confidence = 0.95;
  else if (margin >= 4) confidence = 0.85;
  else if (margin >= 2) confidence = 0.7;
  else if (margin >= 1) confidence = 0.55;
  else confidence = 0.35;
  if (observedCount < 3) confidence = Math.min(confidence, 0.45);

  return { clubType: winner, scores, confidence, observedCount };
}

const RUBRIC = `
[채점 인구 앵커 — 매우 중요]
한국 일반 골퍼 분포는 대략 다음과 같습니다. 이 비율을 머릿속에 두고 채점하세요.
  · 골린이(beginner): 약 60% — 입문 1년 이내 또는 헛스윙/뒷땅 빈번
  · 아마추어(amateur): 약 32% — 주말 골퍼 다수, 100타~85타 수준
  · 세미프로(semipro): 약 7% — 싱글 핸디캡, 70타대 안정
  · 프로(pro): 약 1% — 투어 출전 가능 수준

→ 평범한 주말 골퍼는 amateur LV-1~2가 정상입니다.
→ "조금 잘 친다"는 인상이 들면 한 단계 낮춰 채점하세요.
→ "꽤 잘 친다"가 amateur LV-3 정도. 진짜 semipro 이상은 분명한 기술적 정교함이 보여야 합니다.

[3점은 거의 주지 않습니다 — 핵심]
- 3점은 "이 동작만 떼어서 봐도 프로가 인정할 수준". 매우 신중히 부여.
- 평범하지만 결함 없으면 1~2점이 정상. 평균 이상 + 결함 없음일 때만 2점.
- 분명한 결함 = 1점, 명백한 문제 = 0점.
- 한 영상에서 3점이 4개 이상이면 그 사람은 이미 프로 후보입니다.
- 일반 골퍼는 8항목 평균 1.0~1.5 사이가 자연스럽습니다.

[8개 매커니즘 항목 — 각 0~3점, 합계 0~24점. 보수적으로 매김]
각 항목에는 1점/2점의 경계를 고정하는 앵커 예시가 있습니다.
관찰이 앵커 사이에서 애매하면 반드시 낮은 쪽을 선택합니다.

A) address (어드레스/셋업) [기본기 가중치 ★]
   3=그립·정렬·볼 위치·자세각 모두 안정 / 2=한두 군데 미세 편차
   1=그립 또는 볼 위치 분명한 결함 1~2개 / 0=셋업 전반이 흐트러짐
   · 2점 앵커: "정렬이 목표보다 살짝 오픈되어 있으나 그립·볼 위치·자세각은 교본에 가까움"
   · 1점 앵커: "그립이 손바닥 위주로 잡혀 약하고, 볼 위치가 클럽 대비 반 개 이상 어긋남"

B) takeaway (테이크어웨이~백스윙 플레인) [기본기 가중치 ★]
   3=한 동작처럼 플레인 위로 / 2=약간 편차 후 복귀
   1=인사이드/아웃사이드 픽업 분명 / 0=손목·허리 회전 없음
   · 2점 앵커: "초반에 헤드가 살짝 안쪽으로 빠지지만 하프웨이백에서 플레인으로 복귀"
   · 1점 앵커: "시작부터 손목으로 들어 올려 헤드가 플레인 위쪽 바깥 궤도로 올라감"

C) top (탑 포지션)
   3=좌측 팔 곧음, 셔프트 평행 / 2=살짝 짧거나 길지만 컨트롤
   1=오버스윙·과소 백스윙, 손 위치 흔들림 / 0=좌측 팔 크게 굽음, 크로스/레이드오프 심함
   · 2점 앵커: "셔프트가 평행보다 약간 못 미치지만 좌측 팔 곧고 손 위치 안정"
   · 1점 앵커: "셔프트가 평행을 훌쩍 넘는 오버스윙 + 좌측 팔꿈치가 눈에 띄게 굽음"

D) transition (전환·다운스윙 시퀀스) [기본기 가중치 ★]
   3=하체→상체→팔 순서 자연스러움 / 2=시퀀스 OK, 미세 캐스팅
   1=상체 우선·캐스팅 분명 / 0=클럽 바깥쪽으로 떨어짐, 일찍 풀림
   · 2점 앵커: "골반이 먼저 돌기 시작하는 게 보이나 팔이 반 박자 일찍 따라와 미세한 캐스팅"
   · 1점 앵커: "탑에서 어깨와 팔이 동시에 덮치듯 내려오고 클럽이 바깥 궤도로 떨어짐"

E) impact (임팩트)
   3=헤드<손, 좌측 벽, 페이스 스퀘어 / 2=임팩트 안정, 미세 편차
   1=우측 체중 잔존, 페이스 오픈/클로즈 큼 / 0=헛스윙·뒷땅·탑볼 위험
   · 2점 앵커: "손이 헤드보다 앞서고 좌측 벽 형성, 페이스만 살짝 열림"
   · 1점 앵커: "임팩트 순간 체중이 오른발에 남아 있고 상체가 일어나며 맞음"

F) finish (팔로우스루·피니시)
   3=균형 잡힌 풀 피니시 / 2=피니시 가지만 균형 흔들림
   1=피니시까지 못 가거나 척추 무너짐 / 0=거의 멈춤, 측면 휘청임
   · 2점 앵커: "풀 피니시까지 가지만 마지막에 오른발이 살짝 따라 나가며 흔들림"
   · 1점 앵커: "팔로우스루가 허리 높이에서 멈추고 상체가 목표 반대로 기움"

G) tempo (템포·리듬)
   3=백:다운≈3:1, 일정 호흡 / 2=약간 빠르거나 느림, 일관성 있음
   1=전환 급가속·과속 / 0=처음부터 끝까지 휙
   · 2점 앵커: "전체적으로 빠른 편이지만 백스윙:다운스윙 비율 자체는 일정"
   · 1점 앵커: "탑에서 멈춤 없이 낚아채듯 급가속, 백스윙 대비 다운스윙이 지나치게 빠름"

H) balance (밸런스·축 안정성) [기본기 가중치 ★]
   3=백스윙 우측축, 다운 좌측축 명확. 스웨이 없음 / 2=작은 스웨이/리버스 피벗 기미
   1=명확한 스웨이/머리 이동 / 0=축 무너짐
   · 2점 앵커: "백스윙에서 골반이 공 반 개 정도 밀리지만 다운스윙에서 복구"
   · 1점 앵커: "백스윙에서 머리가 머리 반 개 이상 우측 이동, 임팩트에서 복구 안 됨"

[가중 채점 — 매우 중요]
당신이 매기는 항목별 0~3점은 원본 점수입니다. 등급 결정은 코드에서 다음과 같이 가중치를 적용합니다:
- 기본기 4항목(★ address, takeaway, transition, balance) × 1.5
- 화려한 4항목 (top, impact, finish, tempo) × 1.0
- 최댓값: 4×3×1.5 + 4×3×1.0 = 18 + 12 = 30점

→ 기본기 한 항목의 차이가 등급에 더 크게 영향을 미칩니다.
→ 화려한 임팩트나 피니시가 인상적이어도 기본기가 부실하면 등급은 낮아져야 합니다.
→ 기본기 항목 채점에 특히 엄격하게 임하세요.

[가중 합계 → 등급/단계 매핑 — 코드에서 결정적으로 계산]
가중 합계 (Math.floor):
   0-3   beginner LV1  /   4-6   LV2  /   7-9   LV3
  10-13  amateur  LV1  /  14-16  LV2  /  17-19  LV3
  20-21  semipro  LV1  /  22-24  LV2  /  25-26  LV3
  27     pro      LV1  /  28-29  LV2  /  30     LV3

[밴드 인구 분포 일치]
- 골린이(0-9): 한국 골퍼 ~60% 점유. 평범한 입문자~초보 수준.
- 아마추어(10-19): ~32%. 가장 넓은 밴드. 일반 주말 골퍼는 대개 LV-1~2.
- 세미프로(20-26): ~7%. 싱글 핸디캡 수준의 기술적 안정성.
- 프로(27-30): ~1%. 거의 도달 불가능. 8항목 평균 2.7+ 필요.

[강한 하드 게이트 — 코드에서 강제 적용. 미달 시 자동 강등]
- pro 등급: 8항목 모두 ≥2점 + 3점이 4개 이상 + 기본기 4항목 모두 = 3점 필요.
  미달 시 semipro LV-3로 강등.
- semipro/pro: 기본기 4항목(★) 모두 ≥2점 필요. 미달 시 amateur LV-3.
- amateur: 기본기 3개↑가 ≥1점 + 8항목 중 ≥1점이 4개↑ 필요. 미달 시 beginner LV-3.
→ 가중 합계가 높아도 기본기 한 항목이라도 1점이면 semipro/pro 절대 불가.

[일관성·반인플레이션 규칙]
- 같은 영상은 같은 점수가 나와야 함. 영상 외 어떤 정보도 점수에 반영 금지.
- 사용자의 이전 기록, 선입견, 동기부여 가산점 모두 절대 금지.
- 영상에서 보이지 않는 항목은 보수적으로 1점, note에 "관찰 한계" 명시.
- 채점을 마친 뒤 한 번 더 검토: "내가 후하게 준 항목은 없는가?" 의심되면 한 단계 낮춤.
- 평범한 주말 골퍼는 amateur LV-1~2가 정상. "조금 잘 친다" 인상이면 아마추어 LV-3.
- 별도로 자기보정 단계가 또 한 번 점수를 검토합니다.
`;

// ---------- Stage 1: 헤드코치 판정 ----------

const HEAD_JUDGE_PROMPT = `당신은 ${HEAD_COACH.name}입니다. ${HEAD_COACH.voiceGuide}

[당신의 임무 — 단계 1/3: 클럽 인식 + 등급 판정]

[입력 형식 — 1~2개 시점의 영상이 제공될 수 있음]
이번 요청에는 측면샷(side) 또는 정면샷(front), 혹은 **둘 다** 제공될 수 있습니다.
각 영상마다 ffmpeg로 뽑은 5장의 720px 정지 프레임이 함께 옵니다.
프레임은 위상 감지를 거쳐 실제 어드레스/백스윙/탑/임팩트/피니시 순간에 맞춰
추출되었을 수 있습니다(라벨에 "위상 감지" 표기). 프레임 라벨에
"측면샷" / "정면샷"이 명시되어 있습니다.

[부위별 분석관 보고서 — 제공될 경우 채점의 1차 근거로 사용]
하체(발·무릎·골반) / 상체(어깨·팔·손목) / 축(머리·척추각) 3인의 전문 분석관이
같은 프레임을 먼저 관찰한 보고서가 텍스트로 함께 제공될 수 있습니다.
- mechanicsScores의 각 note는 가능한 한 분석관 보고서의 구체적 관찰
  (또는 직접 확인한 프레임 근거)을 인용해야 합니다.
- 근거 없는 인상 평가("전반적으로 불안정") 금지. 무엇이 어느 위상에서
  어떻게 보였는지 적으세요.
- 분석관 보고와 영상이 충돌하면 직접 관찰을 우선하되 note에 그 사실을 남기세요.

[시점별 강점 — 분석에 적극 활용]
- **측면샷(side)**: 스윙 플레인, 척추 각, 클럽 길이, 어택 앵글, 탑 포지션, 임팩트 자세,
  피니시 균형 같은 X-Z 평면(앞뒤 깊이 + 상하) 정보에 강함.
- **정면샷(front)**: 정렬, 머리 움직임, 스웨이/축 안정성, 스탠스 폭, 체중 이동,
  좌우 어깨 회전 같은 X-Y 평면(좌우 + 상하) 정보에 강함.

[멀티 시점 분석 규칙]
- 클럽 인식(정적 단서): 측면샷이 있으면 클럽 길이/헤드 모양/볼-스탠스 위치는 측면샷 우선.
  스탠스 폭은 정면샷이 더 잘 보임. 두 시점의 단서를 모두 단서 투표에 반영하세요.
- 매커니즘 채점:
  · address, takeaway, top, transition, impact, finish → 측면샷 우선
  · balance(스웨이), 정렬 관련 관찰 → 정면샷 우선
  · 두 시점이 충돌하면 측면샷을 신뢰하되, 정면샷에서만 보이는 명백한 결함(예: 큰 스웨이)은
    반드시 반영합니다.
- 동적 단서(스윙 호, 템포, 페이스 회전)는 영상(파일)으로 확인.
- 한 시점만 있어도 정상 동작하지만, note에 "정면 미제공으로 스웨이 단정 어려움" 같은
  관찰 한계를 명시하세요.

1) 클럽 자동 인식 — 정형 관찰만 정확히 채우세요. 분류는 서버가 결정합니다.

   [핵심 원칙]
   - 당신은 clubObservations 8개 항목만 정확히 채우면 됩니다.
   - clubType / clubScores / clubConfidence는 형식상 함께 출력하되,
     **서버가 clubObservations만 보고 가중 알고리즘으로 최종 분류**합니다.
     당신의 clubType 출력이 서버 결정과 달라도 무방.
   - 확실하지 않으면 무조건 "관찰 불가". 추측·짐작 금지.
   - 8개 항목을 모두 빠짐없이 채워야 합니다 (값 또는 "관찰 불가").

   [단서별 가중치 — 서버에서 적용]
   ★★ headShape (헤드 모양):  가중치 3 — 가장 결정적. 신중히 보세요.
   ★★ clubLength (클럽 길이): 가중치 3 — 결정적.
   ★  tee, ballPosition:      가중치 2 — 강한 단서.
        stanceWidth, spineAngle, swingArc, swingTempo: 가중치 1 — 보조.

   [enum 값 — 정확한 이 문자열만 사용]

   ## 어드레스 정지 단서

   ▶ tee (티 사용/높이)
     · "높은 티"     → 자동 티업이 공을 5cm 이상 올림. **드라이버 전용**.
     · "낮은 티"     → 공이 매트보다 1~2cm만 위. 아이언용.
     · "티 없음"     → 공이 매트/잔디 표면에 직접. (모호 — 다른 단서가 결정)
     · "관찰 불가"   → 명확히 안 보임.

   ▶ ballPosition (스탠스 내 공 위치)
     · "앞발 안쪽"              → 왼발(타깃쪽) 안쪽 가까이. 드라이버.
     · "스탠스 중앙-약간 왼쪽"   → 두 발 중앙 ~ 살짝 왼쪽. 아이언.
     · "스탠스 중앙/뒤"          → 중앙 또는 오른발쪽. 어프로치.
     · "관찰 불가"

   ▶ stanceWidth (스탠스 폭)
     · "어깨보다 넓음"   → 두 발이 어깨선 바깥. 드라이버.
     · "어깨 너비"      → 어깨와 거의 같은 폭. 아이언.
     · "어깨보다 좁음"   → 어깨보다 안쪽. 어프로치.
     · "관찰 불가"

   ▶ spineAngle (어드레스 시 척추 기울기)
     · "거의 수직"        → 상체가 거의 안 숙음 (어퍼 어택). 드라이버.
     · "중간 정도 숙임"   → 일반적 어드레스. 아이언.
     · "많이 숙임"        → 상체 굽음 + 무릎 더 굽음. 어프로치.
     · "관찰 불가"

   ▶ clubLength (클럽 길이) ★★ 가중치 3
     · "긴 편"   → 그립이 골퍼 허리 윗부분, 헤드가 발에서 멀리. 44~46인치 드라이버.
     · "중간"    → 그립이 허리 부근, 헤드가 발 앞 가까이. 35~38인치 아이언.
     · "짧음"    → 그립이 허리 아래, 헤드가 발 바로 앞. 33~35인치 웨지.
     · "관찰 불가"

   ▶ headShape (헤드 모양) ★★★ 가장 결정적 가중치 3
     · "큰 둥근 헤드"
        → 드라이버. 헤드 부피 매우 큼(450cc+), 둥글고 페이스 면적이 큼.
          종종 메탈릭/검정. 헤드 깊이 깊음. 페이스가 거의 직각으로 서있음.
     · "얇은 블레이드"
        → 아이언. 헤드가 얇고 평평한 직사각형. 페이스 면적 작음.
          헤드 길이가 발끝쪽으로 길게 뻗음. 페이스 각도는 중간(20~40도).
     · "누운 큰 로프트 면"
        → 웨지/어프로치. 클럽 페이스가 거의 누워있는 듯 위쪽으로 향함.
          헤드 길이는 아이언보다 약간 짧음. 페이스 각도 50~60도.
     · "관찰 불가"

   ## 동적 단서 (스윙 중)

   ▶ swingArc (스윙 호의 크기)
     · "큰 호"               → 헤드 궤적이 크고 폭넓음. 드라이버.
     · "중간"                → 적당한 호. 아이언.
     · "컴팩트한 작은 호"     → 호가 작고 짧음. 어프로치.
     · "관찰 불가"

   ▶ swingTempo (스윙 템포)
     · "느리고 부드러움"   → 긴 클럽이라 천천히. 드라이버.
     · "중간"             → 평균. 아이언.
     · "짧고 빠름"        → 컴팩트하게. 어프로치.
     · "관찰 불가"

   [시점 우선순위 — 멀티뷰일 때 충돌 처리]
   - **headShape, clubLength, ballPosition, spineAngle** → 측면샷 우선 (각도가 명확)
   - **stanceWidth** → 정면샷 우선 (좌우 폭을 직접 봄)
   - 한 시점만 있어도 답할 수 있는 항목은 그 시점 기준으로 채움.
   - 둘 다 안 보이면 "관찰 불가".

   [출력 형식 보조 필드]
   - clubType: 당신이 관찰을 보고 추론한 클럽. 서버가 가중 분류 결과와 비교만 함.
   - clubScores: 임의로 채워도 됨 (서버에서 재계산하므로 무시됨).
   - clubConfidence: 임의로 채워도 됨 (서버에서 재계산).
   - clubCues: 실제 관찰된(관찰 불가가 아닌) 단서 3~5개를 짧은 한국어로.
     예: "큰 둥근 헤드", "어깨보다 넓은 스탠스", "높은 티", "큰 호의 스윙".

   [사용자 지정 우선]
   사용자가 클럽을 직접 지정한 경우 위 절차는 형식상 채우되 서버에서 지정값으로 강제됩니다.

2) 매커니즘 8항목 채점 (보수적 채점 원칙)
${RUBRIC}

   기본기 4항목(★: address, takeaway, transition, balance)에 특히 엄격하게.
   기본기 항목 중 하나라도 2점 미만이면 등급이 amateur 이상으로 올라가기 어렵습니다.

3) gradeRationale: 어떤 기본기 항목이 점수를 끌어내렸는지/끌어올렸는지 2~3문장.

[출력 JSON — 이 형식만, 코드펜스/설명 금지]
{
  "clubObservations": {
    "tee":           "높은 티" | "낮은 티" | "티 없음" | "관찰 불가",
    "ballPosition":  "앞발 안쪽" | "스탠스 중앙-약간 왼쪽" | "스탠스 중앙/뒤" | "관찰 불가",
    "stanceWidth":   "어깨보다 넓음" | "어깨 너비" | "어깨보다 좁음" | "관찰 불가",
    "spineAngle":    "거의 수직" | "중간 정도 숙임" | "많이 숙임" | "관찰 불가",
    "clubLength":    "긴 편" | "중간" | "짧음" | "관찰 불가",
    "headShape":     "큰 둥근 헤드" | "얇은 블레이드" | "누운 큰 로프트 면" | "관찰 불가",
    "swingArc":      "큰 호" | "중간" | "컴팩트한 작은 호" | "관찰 불가",
    "swingTempo":    "느리고 부드러움" | "중간" | "짧고 빠름" | "관찰 불가"
  },
  "clubScores": { "driver": number, "iron": number, "approach": number },
  "clubType": "driver" | "iron" | "approach",
  "clubConfidence": number,
  "clubCues": [string, ...],
  "mechanicsScores": [
    { "dim": "address",    "score": 0|1|2|3, "note": string },
    { "dim": "takeaway",   "score": 0|1|2|3, "note": string },
    { "dim": "top",        "score": 0|1|2|3, "note": string },
    { "dim": "transition", "score": 0|1|2|3, "note": string },
    { "dim": "impact",     "score": 0|1|2|3, "note": string },
    { "dim": "finish",     "score": 0|1|2|3, "note": string },
    { "dim": "tempo",      "score": 0|1|2|3, "note": string },
    { "dim": "balance",    "score": 0|1|2|3, "note": string }
  ],
  "gradeRationale": string
}`;

// ---------- Stage 2: 전담 코치 분석/티칭 ----------

const DIFFERENTIAL_TREE = `[감별 진단 — 흔한 결함은 반드시 서브타입까지 갈라내세요]
아래 후보 진단이 떠오르면 감별 관찰로 서브타입을 확정한 뒤, 서브타입에 맞는 드릴을 처방합니다.
서브타입 구분 없이 라벨만 던지면 헤드코치 리뷰에서 개별성 0점.

1) "팔위주 스윙" 후보 → 감별:
   · 탑에서 골반 회전이 어깨 대비 크게 부족한가? → [회전 제한형]: 골반 회전 드릴
   · 골반은 도는데 전환에서 팔이 먼저 내려오는가? → [시퀀스형]: 전환 타이밍 드릴
   · 어드레스부터 그립·팔에 긴장이 보이는가? → [셋업 긴장형]: 그립 압력 드릴

2) "헤드업" 후보 → 감별:
   · 임팩트 전 척추각이 일어서는가? → [얼리 익스텐션형]: 벽 엉덩이 드릴
   · 척추각은 유지되는데 시선이 먼저 목표로 가는가? → [시선 추적형]: 시선 고정 드릴

3) "스웨이" 후보 → 감별:
   · 백스윙에서 골반이 우측으로 밀리는가? → [백스윙 스웨이형]: 우측 벽 드릴
   · 다운스윙에서 좌측으로 못 넘어가는가? → [체중 이동 부족형]: 스텝 드릴

weaknesses의 해당 항목 title에 서브타입을 자연스럽게 녹여 쓰고(예: "팔이 먼저
내려오는 전환 타이밍"), detail에 감별 근거를 담으세요.`;

const ANTI_CLICHE = `[상투 진단 금지 — 개별성 규칙]
- 다음 표현 단독 사용 금지: "팔로만 스윙", "힘이 많이 들어감", "헤드업",
  "몸이 굳어 있음", "일관성이 부족함".
  사용하려면 반드시 ①어느 위상에서 ②어느 신체 부위가 ③무엇과 비교해
  어떻게 보였는지를 함께 씁니다.
- 모든 weaknesses 항목에는 evidence 필드 필수: 부위별 분석관 보고서의 관찰
  또는 프레임 근거를 인용 (예: "탑 프레임에서 골반 회전이 어깨 대비 절반 이하 —
  하체 분석관 관찰").
- 바넘 테스트: 쓴 문장을 임의의 다른 골퍼 결과에 복사해도 어색하지 않다면
  그 문장은 다시 쓰세요. 이 사용자 영상에서만 성립하는 문장이어야 합니다.`;

function buildCoachPrompt(
  coach: CoachPersona,
  judgement: HeadJudgement,
  grade: Grade,
  level: Level,
  regionReports: RegionReport[],
  previous?: PreviousAnalysisContext,
): string {
  const weakest = [...judgement.mechanicsScores]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((m) => `${MECHANICS_LABEL[m.dim]}(${m.score}/3): ${m.note}`)
    .join("\n  - ");

  const homeworkBlock = previous
    ? `[숙제 검사 — 필수]
이 사용자는 ${new Date(previous.createdAt).toLocaleDateString("ko-KR")}에 같은 클럽으로 분석을 받았고,
그때의 #1 포커스(숙제)는 "${previous.topFocusTitle}"였습니다.
당시 항목별 점수: ${previous.mechanicsScores.map((s) => `${MECHANICS_LABEL[s.dim as MechanicsDim] ?? s.dim} ${s.score}`).join(", ")}

이번 영상·분석관 보고서·현재 점수를 근거로 숙제가 개선됐는지 판정하세요:
- verdict: "improved"(좋아짐) | "same"(비슷함) | "regressed"(나빠짐) | "not_observable"(이번 영상으론 판단 불가)
- comment: 무엇이 어떻게 달라졌는지 1~2문장. 개선됐으면 구체적으로 칭찬,
  아니면 다정하지만 정확하게. coachMessage 첫머리에서도 숙제 결과를 자연스럽게 언급하세요.`
    : `[숙제 검사]
이 클럽으로는 첫 분석입니다. homeworkCheck는 null로 출력하세요.`;

  return `당신은 ${coach.name}(${coach.title})입니다. ${coach.vibe}.

[페르소나·말투 가이드]
${coach.voiceGuide}

[금지 표현 — 위반 시 헤드코치 리뷰 큰 감점]
${coach.forbiddenTerms.length ? coach.forbiddenTerms.map((t) => `"${t}"`).join(", ") : "(없음)"}

[권장 표현 — 적극 사용]
${coach.preferredTerms.length ? coach.preferredTerms.map((t) => `"${t}"`).join(", ") : "(없음)"}

[답변 분량 규칙 — 엄수]
${coach.lengthRule}

[배정 컨텍스트 — 헤드코치 판정 결과]
- 사용자 등급: ${GRADE_LABEL[grade]} LV-${level} (총 ${judgement.mechanicsScores.reduce((s, m) => s + m.score, 0)}/24점)
- 사용 클럽: ${CLUB_LABEL[judgement.clubType]}
- 헤드코치 판정 근거: ${judgement.gradeRationale}
- 점수가 가장 낮은 3항목 (우선 교정 대상):
  - ${weakest}

${renderRegionReports(regionReports) || "[부위별 분석관 보고서 없음 — 영상·프레임을 직접 관찰해 근거를 확보하세요]"}

${homeworkBlock}

[당신의 클럽 특화 코칭 포인트 — ${CLUB_LABEL[judgement.clubType]}]
${coach.clubFocus[judgement.clubType]}

이 영상을 다시 자세히 보고, 분석관 보고서와 위 클럽 특화 포인트에 비춰서 분석/티칭하세요.

${ANTI_CLICHE}

${DIFFERENTIAL_TREE}

[드릴 처방 — 절대 규칙. 위반 시 헤드코치 리뷰에서 드릴 적합성 0점]
- 모든 드릴은 반드시 **집(거실/방) 또는 회사(책상/회의실)** 에서 실행 가능해야 합니다.
- 골프 클럽 없이 가능하거나, 흔한 가정/사무 용품으로 대체 가능해야 합니다.
- 허용 도구만 사용: 거울, 의자, 벽, 책, 우산, 빈 페트병, 신문지, 양말 묶음, 손수건, 빗자루, 종이컵, 스마트폰 거치대
- 절대 금지: 골프 클럽 필수, 골프공 필요, 골프장/연습장 방문, 야외 활동, 골프 매트, 골프 그물, 임팩트 백
- 각 드릴 detail에는 "무엇을 / 몇 회 또는 몇 분 / 무엇을 체크하는지"를 반드시 포함.
- 드릴은 감별된 서브타입에 맞게 2~3개.

[강조 포인트 규칙]
- strengths / weaknesses / drills 각 섹션에서 정확히 1개를 emphasis="key"로 표시.
- topFocus는 가장 점수가 낮은 항목과 직접 연결된, 다음 라운드 전 단 하나의 우선순위.
  topFocus.detail에도 관찰 근거를 담으세요.

[출력 JSON — 이 형식만, 코드펜스/설명 금지]
{
  "homeworkCheck": null | { "previousFocus": string, "verdict": "improved"|"same"|"regressed"|"not_observable", "comment": string },
  "topFocus": { "title": string, "detail": string, "why": string },
  "strengths":  [{ "title": string, "detail": string, "emphasis": "key" | "normal" }, ...2~3개],
  "weaknesses": [{ "title": string, "detail": string, "evidence": string, "emphasis": "key" | "normal" }, ...2~3개],
  "drills":     [{ "title": string, "detail": string, "emphasis": "key" | "normal" }, ...2~3개],
  "coachMessage": string,
  "oneLineSummary": string (40자 이내)
}

모든 문자열은 한국어. 분량·금지어·드릴·증거 규칙을 모두 지키세요.`;
}

// ---------- Stage 3: 헤드코치 리뷰 ----------

function buildReviewPrompt(
  coach: CoachPersona,
  judgement: HeadJudgement,
  grade: Grade,
  level: Level,
  coachOutput: CoachOutput,
  attempt: number,
): string {
  return `당신은 ${HEAD_COACH.name}입니다. ${coach.name}이 작성한 분석/티칭을 검토합니다.

[검토 컨텍스트]
- 사용자 등급: ${GRADE_LABEL[grade]} LV-${level}
- 사용 클럽: ${CLUB_LABEL[judgement.clubType]}
- 코치의 금지 표현: ${coach.forbiddenTerms.join(", ") || "(없음)"}
- 코치의 권장 표현: ${coach.preferredTerms.join(", ") || "(없음)"}
- 분량 규칙: ${coach.lengthRule}
- 클럽 특화 포인트: ${coach.clubFocus[judgement.clubType]}
- 시도 번호: ${attempt}/${MAX_REVIEW_ATTEMPTS}

[코치 출력물]
${JSON.stringify(coachOutput, null, 2)}

[100점 만점 채점 기준]
1) 등급 적합성 (30점)
   - ${GRADE_LABEL[grade]} LV-${level} 수준에 맞는 어휘인가?
   - 금지 표현 사용 시 큰 감점. 권장 표현 사용 시 가점.
   - 골린이에게 전문 용어/프로에게 초보 비유 → 큰 감점.

2) 클럽 특화성 (15점)
   - ${CLUB_LABEL[judgement.clubType]}에 맞는 구체적 분석/티칭인가?
   - 일반론만 늘어놓으면 감점.

3) 매커니즘 일치 (10점)
   - 헤드코치가 짚은 가장 약한 항목을 정확히 짚었는가?
   - 강한 항목을 약점으로 짚으면 큰 감점.

4) 개별성 — 바넘 테스트 (15점)
   - weaknesses의 각 문장을 임의의 다른 골퍼 결과에 복사해도 어색하지 않은가?
     그렇다면 그 항목당 5점씩 감점. ("팔로만 스윙하시네요" 단독 = 일반론)
   - 각 weakness에 evidence(관찰 근거 인용)가 있는가? 없으면 항목당 3점 감점.
   - 흔한 결함("팔위주", "헤드업", "스웨이")에 서브타입 감별이 있는가?
     라벨만 던지면 감점.
   - homeworkCheck가 요구됐는데 없거나 형식 위반이면 5점 감점.

5) 드릴 적합성 (20점)
   - 집/회사에서 가능한가? (절대 규칙)
   - 골프장/연습장 필요한 드릴 포함 시 0점.
   - 구체적으로 횟수·체크 포인트 명시되었는가?
   - 감별된 서브타입에 맞는 드릴인가? 서브타입과 무관한 범용 드릴이면 감점.

6) 간결성·임팩트 (10점)
   - 분량 규칙 준수? (골린이 다정 / 프로 단호)
   - 군더더기·중복 없는가?

[규칙]
- 90점 이상이면 passed=true, feedback="". 사용자에게 전달.
- 90점 미만이면 passed=false, feedback에 **구체적이고 실행 가능한** 수정 지시.
  (예: "drills의 두 번째 항목 '연습장 가기'는 집/회사 규칙 위반. '거울 앞 어드레스 30회'로 교체"
   "coachMessage에 '클럽 패스' 용어가 골린이에게 부적절. '클럽이 지나가는 길'로 풀어쓸 것")

[출력 JSON — 이 형식만]
{
  "score": 0-100 정수,
  "passed": boolean,
  "feedback": string,
  "breakdown": {
    "gradeMatch": 0-30,
    "clubSpecific": 0-15,
    "mechanicsAlignment": 0-10,
    "individuality": 0-15,
    "drillFit": 0-20,
    "conciseness": 0-10
  }
}`;
}

// ---------- 내부 타입 ----------

interface HeadJudgement {
  clubType: ClubType;
  clubConfidence: number;
  clubCues: string[];
  clubObservations?: Record<string, string>;
  clubScores?: Record<ClubType, number>;
  mechanicsScores: MechanicsScore[];
  gradeRationale: string;
}

interface CoachOutput {
  topFocus: SwingFocus;
  strengths: SwingPoint[];
  weaknesses: SwingPoint[];
  drills: SwingPoint[];
  coachMessage: string;
  oneLineSummary: string;
  homeworkCheck?: HomeworkCheck | null;
}

/** 코치에게 전달할 이전 분석 컨텍스트 (숙제 검사용) */
export interface PreviousAnalysisContext {
  createdAt: string;
  topFocusTitle: string;
  mechanicsScores: { dim: MechanicsDim; score: number }[];
}

// ---------- 유틸 ----------

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");
    return JSON.parse(cleaned);
  }
}

function normalizeMechanics(raw: unknown): MechanicsScore[] {
  const allowed = new Set<MechanicsDim>(MECHANICS_DIMENSIONS);
  const byDim = new Map<MechanicsDim, MechanicsScore>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const r = item as { dim?: unknown; score?: unknown; note?: unknown };
      const dim = String(r.dim ?? "") as MechanicsDim;
      if (!allowed.has(dim)) continue;
      const score = Math.max(0, Math.min(3, Math.round(Number(r.score ?? 0)))) as 0 | 1 | 2 | 3;
      byDim.set(dim, { dim, score, note: String(r.note ?? "").trim() });
    }
  }
  return MECHANICS_DIMENSIONS.map(
    (d) =>
      byDim.get(d) ?? {
        dim: d,
        score: 1 as const,
        note: "관찰 정보 부족으로 보수적으로 채움.",
      },
  );
}

function normalizePoints(raw: unknown): SwingPoint[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: SwingPoint[] = raw
    .map((p) => {
      const r = p as {
        title?: unknown;
        detail?: unknown;
        emphasis?: unknown;
        evidence?: unknown;
      };
      const emphasis: "key" | "normal" = r.emphasis === "key" ? "key" : "normal";
      const evidence = String(r.evidence ?? "").trim();
      return {
        title: String(r.title ?? "").trim(),
        detail: String(r.detail ?? "").trim(),
        emphasis,
        ...(evidence ? { evidence } : {}),
      };
    })
    .filter((p) => p.title || p.detail);
  const keyCount = cleaned.filter((p) => p.emphasis === "key").length;
  if (cleaned.length > 0 && keyCount !== 1) {
    cleaned.forEach((p, i) => {
      p.emphasis = i === 0 ? "key" : "normal";
    });
  }
  return cleaned;
}

function normalizeHomework(raw: unknown): HomeworkCheck | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { previousFocus?: unknown; verdict?: unknown; comment?: unknown };
  const verdicts = ["improved", "same", "regressed", "not_observable"] as const;
  const verdict = verdicts.includes(r.verdict as (typeof verdicts)[number])
    ? (r.verdict as HomeworkCheck["verdict"])
    : "not_observable";
  const previousFocus = String(r.previousFocus ?? "").trim();
  const comment = String(r.comment ?? "").trim();
  if (!previousFocus && !comment) return null;
  return { previousFocus, verdict, comment };
}

function normalizeCoachOutput(raw: unknown): CoachOutput {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const rawFocus = obj.topFocus as
    | { title?: unknown; detail?: unknown; why?: unknown }
    | undefined;
  return {
    topFocus: {
      title: String(rawFocus?.title ?? "").trim() || "오늘의 핵심 포인트",
      detail: String(rawFocus?.detail ?? "").trim(),
      why: String(rawFocus?.why ?? "").trim(),
    },
    strengths: normalizePoints(obj.strengths),
    weaknesses: normalizePoints(obj.weaknesses),
    drills: normalizePoints(obj.drills),
    coachMessage: String(obj.coachMessage ?? "").trim(),
    oneLineSummary: String(obj.oneLineSummary ?? "").trim().slice(0, 80),
    homeworkCheck: normalizeHomework(obj.homeworkCheck),
  };
}

function normalizeReview(raw: unknown, attempt: number): ReviewResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const score = Math.max(0, Math.min(100, Math.round(Number(obj.score ?? 0))));
  const b = (obj.breakdown ?? {}) as Record<string, unknown>;
  const breakdown: ReviewBreakdown = {
    gradeMatch: Math.max(0, Math.min(30, Math.round(Number(b.gradeMatch ?? 0)))),
    clubSpecific: Math.max(0, Math.min(15, Math.round(Number(b.clubSpecific ?? 0)))),
    mechanicsAlignment: Math.max(
      0,
      Math.min(10, Math.round(Number(b.mechanicsAlignment ?? 0))),
    ),
    individuality: Math.max(0, Math.min(15, Math.round(Number(b.individuality ?? 0)))),
    drillFit: Math.max(0, Math.min(20, Math.round(Number(b.drillFit ?? 0)))),
    conciseness: Math.max(0, Math.min(10, Math.round(Number(b.conciseness ?? 0)))),
  };
  return {
    score,
    passed: score >= PASS_THRESHOLD,
    feedback: String(obj.feedback ?? "").trim(),
    attemptCount: attempt,
    breakdown,
  };
}

// ---------- 외부 API ----------

export interface AnalyzeVideo {
  view: VideoView;
  filePath: string;
  mimeType: string;
}

export interface AnalyzeInput {
  nickname: string;
  /** 분석할 영상 1~2개. 측면샷 권장, 정면샷 선택. 둘 다 있으면 더 정확. */
  videos: AnalyzeVideo[];
  clubHint?: ClubType;
  history: {
    createdAt: string;
    clubType: ClubType;
    grade: Grade;
    level: Level;
    oneLineSummary: string;
  }[];
  /** 클럽별 직전 분석 컨텍스트 (숙제 검사용). 클럽 판정 후 해당 클럽 것만 사용 */
  previousByClub?: Partial<Record<ClubType, PreviousAnalysisContext>>;
}

function makeModel(systemInstruction: string) {
  const genAI = new GoogleGenerativeAI(apiKey());
  const generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    temperature: 0.1,
    topP: 0.1,
    maxOutputTokens: 4096,
  };
  return genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction,
    generationConfig,
  });
}

// ---------- Stage 0: 스윙 위상 감지 (2-pass 프레임 추출의 Pass 1) ----------

const PHASE_DETECTION_PROMPT = `당신은 골프 스윙 영상에서 각 스윙 단계의 정확한 시점을 찾는 분석기입니다.
영상에는 프리샷 루틴(왜글, 연습 스윙)이나 샷 이후 볼 궤적 확인 장면이 섞여 있을 수 있습니다.
**실제 샷으로 이어지는 본 스윙 1회**를 찾아서 다음 5개 순간의 타임스탬프(초, 소수점 1자리)를 반환하세요.

- address: 본 스윙 직전, 클럽이 볼 뒤에 정지해 있는 마지막 순간
- midBackswing: 백스윙 중 셔프트가 지면과 평행에 가까운 순간
- top: 백스윙 최고점 (전환 직전)
- impact: 클럽이 볼에 닿는 순간 (또는 가장 가까운 프레임)
- finish: 피니시 자세가 완성된 순간

규칙:
- 왜글이나 연습 스윙 중의 정지 장면을 address로 잡지 마세요. 본 스윙 직전이어야 합니다.
- 특정 순간을 정확히 못 찾으면 그 필드만 null.
- 영상에 스윙이 없으면 모든 필드 null.

[출력 JSON — 이 형식만]
{ "address": number|null, "midBackswing": number|null, "top": number|null, "impact": number|null, "finish": number|null }`;

async function runPhaseDetection(
  video: UploadedVideo,
): Promise<PhaseTimestamps | null> {
  const model = makeModel(PHASE_DETECTION_PROMPT);
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: "이 영상의 스윙 위상 타임스탬프를 JSON으로만 출력하세요." },
          { fileData: { mimeType: video.mimeType, fileUri: video.uri } },
        ],
      },
    ],
  });
  const obj = parseJson(result.response.text()) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const ts: PhaseTimestamps = {
    address: num(obj.address),
    "mid-backswing": num(obj.midBackswing),
    top: num(obj.top),
    impact: num(obj.impact),
    finish: num(obj.finish),
  };
  // 시간 순서가 뒤집힌 감지 결과는 신뢰 불가 → 폐기
  const ordered = [ts.address, ts["mid-backswing"], ts.top, ts.impact, ts.finish]
    .filter((v): v is number => typeof v === "number");
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] < ordered[i - 1]) return null;
  }
  return ordered.length >= 2 ? ts : null;
}

// ---------- Stage 0.5: 부위별 전문 분석관 (관찰 전용, 진단 금지) ----------

const REGION_ITEMS: Record<BodyRegion, string> = {
  lower: `[하체 관찰 항목]
- 어드레스: 스탠스 폭, 무릎 굽힘 정도, 체중 분포 인상(앞꿈치/뒤꿈치)
- 백스윙~탑: 골반 회전량(어깨 대비), 우측 무릎 각도 유지 여부, 좌측 힐 리프트 여부
- 전환~임팩트: 골반이 상체보다 먼저 도는지, 좌측 벽 형성, 체중 이동(우→좌)
- 피니시: 골반이 타깃을 향하는지, 하체 균형`,
  upper: `[상체·팔 관찰 항목]
- 어드레스: 그립 긴장도 인상, 팔과 어깨 정렬
- 백스윙~탑: 어깨 회전량, 리드암(좌측 팔) 곧음 정도, 손 높이, 오버스윙 여부
- 전환~임팩트: 팔이 하체보다 먼저 내려오는지(캐스팅), 손목 각 유지, 임팩트 시 손-헤드 관계
- 피니시: 팔로우스루 크기, 팔 뻗음`,
  axis: `[축·머리·척추 관찰 항목]
- 어드레스: 척추 기울기(전경각), 머리 위치
- 백스윙: 머리 좌우 이동량("머리 반 개" 같은 시각 단위), 척추각 유지
- 임팩트: 어드레스 대비 머리 상하/좌우 이동, 상체 일어섬(얼리 익스텐션) 여부
- 피니시: 축 기립 균형`,
};

function buildSpecialistPrompt(region: BodyRegion): string {
  return `당신은 골프 스윙의 ${BODY_REGION_LABEL[region]} 부위만 관찰하는 전문 분석관입니다.

[절대 규칙]
- **관찰만 합니다. 진단·평가·조언 금지.** "~가 문제다", "~해야 한다" 같은 문장 금지.
- 담당 부위 밖은 언급하지 마세요.
- 각 관찰은 짧고 구체적으로: 무엇이 / 어느 위상에서 / 어떻게 보였는지.
- 확실하지 않으면 value에 "관찰 불가"라고 적으세요. 추측 금지.
- 거리·크기는 시각 기준 단위 사용: "머리 반 개", "공 한 개 폭", "어깨 폭의 절반" 등.

${REGION_ITEMS[region]}

[스윙 내 자기 비교 — 필수 2개 이상 시도]
같은 골퍼의 위상 간 변화를 비교하세요 (예: "임팩트에서 머리가 어드레스보다
머리 반 개 낮아짐", "탑에서 어드레스 대비 척추각 유지됨").
비교가 불가능하면 selfComparisons를 빈 배열로.

[출력 JSON — 이 형식만, 코드펜스 금지]
{
  "region": "${region}",
  "observations": [{ "phase": "address|backswing|top|transition|impact|finish", "item": string, "value": string }, ...],
  "selfComparisons": [string, ...],
  "flags": [string, ...]  // 이 부위에서 눈에 띈 특이 관찰 (진단이 아닌 관찰 문장으로)
}`;
}

function normalizeRegionReport(raw: unknown, region: BodyRegion): RegionReport {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown) =>
    Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 8) : [];
  const obsRaw = obj.observations;
  const observations = Array.isArray(obsRaw)
    ? obsRaw
        .map((o) => {
          const r = o as { phase?: unknown; item?: unknown; value?: unknown };
          return {
            phase: String(r.phase ?? "").trim(),
            item: String(r.item ?? "").trim(),
            value: String(r.value ?? "").trim(),
          };
        })
        .filter((o) => o.item && o.value)
        .slice(0, 16)
    : [];
  return {
    region,
    observations,
    selfComparisons: strArr(obj.selfComparisons),
    flags: strArr(obj.flags),
  };
}

async function runRegionSpecialists(
  frames: ExtractedFrame[],
): Promise<RegionReport[]> {
  if (frames.length === 0) return [];
  const regions: BodyRegion[] = ["lower", "upper", "axis"];
  const results = await Promise.all(
    regions.map(async (region) => {
      try {
        const model = makeModel(buildSpecialistPrompt(region));
        const parts: Content["parts"] = [
          {
            text: `아래 스윙 정지 프레임들을 보고 ${BODY_REGION_LABEL[region]} 관찰 JSON만 출력하세요.`,
          },
        ];
        for (const f of frames) {
          parts.push({ text: `--- ${f.label} ---` });
          parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
        }
        const result = await model.generateContent({
          contents: [{ role: "user", parts }],
        });
        return normalizeRegionReport(parseJson(result.response.text()), region);
      } catch (e) {
        console.warn(`부위별 분석관 실패 (${region}):`, e);
        return null;
      }
    }),
  );
  return results.filter((r): r is RegionReport => r !== null);
}

/** 부위별 보고서를 헤드코치·코치 프롬프트에 넣을 텍스트로 렌더링 */
function renderRegionReports(reports: RegionReport[]): string {
  if (reports.length === 0) return "";
  const blocks = reports.map((r) => {
    const obs = r.observations
      .map((o) => `  - [${o.phase}] ${o.item}: ${o.value}`)
      .join("\n");
    const cmp = r.selfComparisons.map((s) => `  - ${s}`).join("\n");
    const flg = r.flags.map((s) => `  - ${s}`).join("\n");
    return `▶ ${BODY_REGION_LABEL[r.region]}
${obs || "  (관찰 없음)"}
${cmp ? `  [자기 비교]\n${cmp}` : ""}
${flg ? `  [특이 관찰]\n${flg}` : ""}`;
  });
  return `[부위별 전문 분석관 보고서]\n${blocks.join("\n\n")}`;
}

export async function analyzeSwingVideo(
  input: AnalyzeInput,
): Promise<SwingAnalysis> {
  if (!input.videos || input.videos.length === 0) {
    throw new Error("분석할 영상이 없습니다.");
  }
  for (const v of input.videos) {
    if (!fs.existsSync(v.filePath)) {
      throw new Error(`업로드된 파일을 찾을 수 없습니다: ${v.filePath}`);
    }
  }

  const fileManager = new GoogleAIFileManager(apiKey());

  // 1) 각 영상 업로드
  const uploads = await Promise.all(
    input.videos.map(async (v) => {
      const uploadResult = await fileManager.uploadFile(v.filePath, {
        mimeType: v.mimeType,
        displayName: `${v.view}-${path.basename(v.filePath)}`,
      });
      return { view: v.view, filePath: v.filePath, uploadResult };
    }),
  );

  // 2) ACTIVE 상태가 될 때까지 모든 파일 대기.
  const start = Date.now();
  for (const u of uploads) {
    let file = await fileManager.getFile(u.uploadResult.file.name);
    while (file.state === FileState.PROCESSING) {
      if (Date.now() - start > 180_000) {
        throw new Error("영상 전처리가 너무 오래 걸려 중단했습니다.");
      }
      await new Promise((r) => setTimeout(r, 2000));
      file = await fileManager.getFile(u.uploadResult.file.name);
    }
    if (file.state !== FileState.ACTIVE) {
      throw new Error(`Gemini 파일 상태가 비정상입니다(${u.view}): ${file.state}`);
    }
    // ACTIVE 상태의 uri/mimeType으로 갱신
    u.uploadResult.file.uri = file.uri;
    u.uploadResult.file.mimeType = file.mimeType;
  }

  const uploadedVideos: UploadedVideo[] = uploads.map((u) => ({
    view: u.view,
    uri: u.uploadResult.file.uri,
    mimeType: u.uploadResult.file.mimeType,
  }));
  const viewsUsed = Array.from(new Set(uploadedVideos.map((v) => v.view)));

  // 3) Pass 1: 영상별 스윙 위상 감지 → Pass 2: 감지된 타임스탬프로 정밀 프레임 추출.
  //    감지 실패 시 고정 비율(10/30/50/70/90%)로 폴백.
  const frameSets = await Promise.all(
    uploads.map(async (u, i) => {
      let timestamps: PhaseTimestamps | null = null;
      try {
        timestamps = await runPhaseDetection(uploadedVideos[i]);
      } catch (e) {
        console.warn(`위상 감지 실패 (${u.view}), 고정 비율로 폴백:`, e);
      }
      return extractKeyFrames(u.filePath, u.view, timestamps ?? undefined).catch(
        (e: unknown) => {
          console.warn(`키 프레임 추출 실패 (${u.view}), 영상만으로 진행:`, e);
          return [] as ExtractedFrame[];
        },
      );
    }),
  );
  const allFrames = frameSets.flat();

  // 4) 부위별 전문 분석관 3인 병렬 관찰 (프레임만 사용, 진단 금지)
  const regionReports = await runRegionSpecialists(allFrames).catch((e) => {
    console.warn("부위별 분석관 실패, 보고서 없이 진행:", e);
    return [] as RegionReport[];
  });

  try {
    // === Stage 1: 헤드코치 판정 (모든 시점 + 키 프레임 + 분석관 보고서) ===
    const judgement = await runHeadJudge(
      uploadedVideos,
      allFrames,
      regionReports,
      input.clubHint,
    );

    // === Stage 1.5: 자기보정 (인플레이션 차단, 텍스트 전용 호출이라 저렴) ===
    let finalScores = judgement.mechanicsScores;
    let calibrationNote: string | undefined;
    try {
      const calibrated = await runSelfCalibration(judgement);
      const merged = applyCalibrationSafely(judgement.mechanicsScores, calibrated.mechanicsScores);
      if (merged.changed) {
        finalScores = merged.scores;
        calibrationNote = `[자기보정 적용] ${calibrated.rationale}`.trim();
      }
    } catch (e) {
      console.warn("자기보정 실패, 원본 점수 사용:", e);
    }

    // 보정된 점수 → 가중 + 비대칭 밴드 + 강한 게이트로 등급/단계 결정
    const {
      grade,
      level,
      total: mechanicsTotal,
      weighted: mechanicsWeighted,
      gateNote,
    } = scoreToGradeLevel(finalScores);
    const coach = COACHES[grade];

    // 코치 단계용 judgement 갱신 (보정된 점수 반영)
    const judgementForCoach: HeadJudgement = {
      ...judgement,
      mechanicsScores: finalScores,
    };

    // 숙제 검사 컨텍스트: 판정된 클럽의 직전 분석
    const previous = input.previousByClub?.[judgement.clubType];

    // === Stage 2 + 3: 코치 티칭 ↔ 헤드코치 리뷰 루프 ===
    let coachOutput: CoachOutput | null = null;
    let review: ReviewResult | null = null;
    let retryFeedback = "";

    for (let attempt = 1; attempt <= MAX_REVIEW_ATTEMPTS; attempt++) {
      coachOutput = await runCoach(
        uploadedVideos,
        allFrames,
        coach,
        judgementForCoach,
        grade,
        level,
        regionReports,
        previous,
        attempt,
        retryFeedback,
      );
      review = await runReview(coach, judgementForCoach, grade, level, coachOutput, attempt);
      if (review.passed) break;
      retryFeedback = review.feedback;
    }

    if (!coachOutput || !review) {
      throw new Error("코치 분석을 생성하지 못했습니다.");
    }

    const rationale = [judgement.gradeRationale, gateNote ?? "", calibrationNote ?? ""]
      .filter(Boolean)
      .join(" / ");

    // === 잠정 등급 판정: 입력 품질이 낮으면 등급을 잠정으로 표시 ===
    const limitNotes = finalScores.filter((s) =>
      /관찰 (한계|불가)|정보 부족/.test(s.note),
    ).length;
    const provisionalReasons: string[] = [];
    if (!input.clubHint && judgement.clubConfidence < 0.6) {
      provisionalReasons.push("클럽 인식 신뢰도가 낮음 — 어드레스가 잘 보이게 다시 촬영하거나 클럽을 직접 지정해 주세요");
    }
    if (limitNotes >= 3) {
      provisionalReasons.push(`매커니즘 ${limitNotes}개 항목이 관찰 한계로 보수 채점됨 — 스윙 전체가 프레임에 들어오게 촬영해 주세요`);
    }
    if (viewsUsed.length === 1 && limitNotes >= 2) {
      provisionalReasons.push(
        viewsUsed[0] === "side"
          ? "정면샷을 추가하면 스웨이·정렬 판정이 정확해져요"
          : "측면샷을 추가하면 플레인·임팩트 판정이 정확해져요",
      );
    }
    const provisional = provisionalReasons.length > 0;

    return {
      views: viewsUsed,
      clubType: judgement.clubType,
      clubConfidence: judgement.clubConfidence,
      clubCues: judgement.clubCues,
      clubObservations: judgement.clubObservations,
      clubScores: judgement.clubScores,
      grade,
      level,
      gradeRationale: rationale,
      mechanicsScores: finalScores,
      mechanicsTotal,
      mechanicsWeighted,
      calibrationNote,
      regionReports: regionReports.length > 0 ? regionReports : undefined,
      homeworkCheck: coachOutput.homeworkCheck ?? null,
      provisional: provisional || undefined,
      provisionalReason: provisional ? provisionalReasons.join(" · ") : undefined,
      topFocus: coachOutput.topFocus,
      strengths: coachOutput.strengths,
      weaknesses: coachOutput.weaknesses,
      drills: coachOutput.drills,
      coachMessage: coachOutput.coachMessage,
      oneLineSummary: coachOutput.oneLineSummary,
      review,
    };
  } finally {
    // 업로드된 모든 파일 정리.
    await Promise.all(
      uploads.map((u) =>
        fileManager.deleteFile(u.uploadResult.file.name).catch(() => {}),
      ),
    );
  }
}

// ---------- Stage runners ----------

interface UploadedVideo {
  view: VideoView;
  uri: string;
  mimeType: string;
}

/**
 * 영상·프레임 parts를 시점별로 묶어서 일관된 순서로 구성한다.
 * 측면샷이 있으면 먼저, 그 다음 정면샷.
 */
function buildMediaParts(
  videos: UploadedVideo[],
  frames: ExtractedFrame[],
): Content["parts"] {
  const parts: Content["parts"] = [];
  const order: VideoView[] = ["side", "front"];
  for (const view of order) {
    const vFrames = frames.filter((f) => f.view === view);
    const vVideos = videos.filter((v) => v.view === view);
    if (vFrames.length === 0 && vVideos.length === 0) continue;
    parts.push({
      text: `\n=== ${VIDEO_VIEW_LABEL[view]} (${view}) ===`,
    });
    if (vFrames.length > 0) {
      parts.push({
        text: `정지 프레임 ${vFrames.length}장 (영상 10/30/50/70/90% 지점):`,
      });
      for (const f of vFrames) {
        parts.push({ text: `- ${f.label}` });
        parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
      }
    }
    for (const v of vVideos) {
      parts.push({ text: `${VIDEO_VIEW_LABEL[view]} 영상:` });
      parts.push({ fileData: { mimeType: v.mimeType, fileUri: v.uri } });
    }
  }
  return parts;
}

// ---------- Stage 1.5: 자기보정 (인플레이션 차단) ----------

const SELF_CALIBRATION_PROMPT = `당신은 ${HEAD_COACH.name}입니다.
방금 어떤 골퍼의 영상을 평가해서 매긴 8항목 점수를 다시 검토합니다.
영상은 다시 보지 않습니다 — 점수와 근거(note)만으로 자기보정합니다.

[검토 기준]
- 한국 골퍼 인구 분포: 골린이 ~60% / 아마추어 ~32% / 세미프로 ~7% / 프로 ~1%.
- 평범한 주말 골퍼는 아마추어 LV-1~2가 정상.
- 기본기(★ address, takeaway, transition, balance)는 가중치 1.5배 → 더 엄격히.
- 화려한 임팩트나 피니시는 인상 좋아도 기본기 부실하면 등급은 낮아져야 함.

[검토 절차]
1) 위 인구 분포에 비추어 현재 점수가 후한지 검토.
2) 후하다 싶으면 가장 의심스러운 항목 1~2개를 1점만큼 낮춤.
3) 변경 없으면 원본 그대로 유지.

[엄격한 규칙]
- 점수를 올리는 것은 절대 금지. 낮추거나 유지만.
- 최대 2개 항목까지만 조정 (한 번에 너무 많이 낮추지 말 것).
- 기본기 항목(★)을 우선 의심.
- 조정 시 해당 항목 note에 "[보정] " 접두사 붙이고 사유 한 줄.

[출력 JSON — 이 형식만, 코드펜스/설명 금지]
{
  "adjusted": boolean,
  "rationale": string,
  "mechanicsScores": [
    { "dim": "address",    "score": 0|1|2|3, "note": string },
    { "dim": "takeaway",   "score": 0|1|2|3, "note": string },
    { "dim": "top",        "score": 0|1|2|3, "note": string },
    { "dim": "transition", "score": 0|1|2|3, "note": string },
    { "dim": "impact",     "score": 0|1|2|3, "note": string },
    { "dim": "finish",     "score": 0|1|2|3, "note": string },
    { "dim": "tempo",      "score": 0|1|2|3, "note": string },
    { "dim": "balance",    "score": 0|1|2|3, "note": string }
  ]
}`;

interface CalibrationResult {
  adjusted: boolean;
  rationale: string;
  mechanicsScores: MechanicsScore[];
}

async function runSelfCalibration(
  judgement: HeadJudgement,
): Promise<CalibrationResult> {
  const model = makeModel(SELF_CALIBRATION_PROMPT);
  const scoreLines = judgement.mechanicsScores
    .map(
      (s) =>
        `- ${MECHANICS_LABEL[s.dim]} (${s.dim}): ${s.score}/3 — ${s.note || "(근거 없음)"}`,
    )
    .join("\n");
  const total = judgement.mechanicsScores.reduce((sum, s) => sum + s.score, 0);

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `[원본 채점]\n${scoreLines}\n\n원본 합계: ${total}/24\n사용 클럽: ${CLUB_LABEL[judgement.clubType]}\n\n위 점수를 자기보정 절차에 따라 검토하고 JSON만 출력하세요.`,
          },
        ],
      },
    ],
  });
  const raw = parseJson(result.response.text()) as Record<string, unknown>;
  return {
    adjusted: Boolean(raw.adjusted),
    rationale: String(raw.rationale ?? "").trim(),
    mechanicsScores: normalizeMechanics(raw.mechanicsScores),
  };
}

/** 보정 결과를 적용하되 점수가 올라가는 항목은 차단(원본 유지). */
function applyCalibrationSafely(
  original: MechanicsScore[],
  calibrated: MechanicsScore[],
): { scores: MechanicsScore[]; changed: boolean } {
  const byDim = new Map(calibrated.map((s) => [s.dim, s]));
  let changed = false;
  const merged = original.map((o) => {
    const c = byDim.get(o.dim);
    if (!c) return o;
    if (c.score < o.score) {
      changed = true;
      return c;
    }
    return o; // 점수 상승·동일 → 원본 유지
  });
  return { scores: merged, changed };
}

async function runHeadJudge(
  videos: UploadedVideo[],
  frames: ExtractedFrame[],
  regionReports: RegionReport[],
  clubHint?: ClubType,
): Promise<HeadJudgement> {
  const model = makeModel(HEAD_JUDGE_PROMPT);
  const hintBlock = clubHint
    ? `[사용자 지정 클럽] "${CLUB_LABEL[clubHint]}"로 고정. clubType="${clubHint}", clubConfidence=1.0, clubCues=["사용자가 직접 지정함"].`
    : `[클럽 자동 인식 필요] 아래 시점들의 정지+동적 단서를 모두 활용해 정확히 판정하세요.`;

  const viewsProvided = Array.from(new Set(videos.map((v) => v.view)));
  const viewsBlock =
    `[제공된 시점] ${viewsProvided.map((v) => VIDEO_VIEW_LABEL[v]).join(" + ") || "없음"}\n` +
    (viewsProvided.length === 1
      ? `* ${VIDEO_VIEW_LABEL[viewsProvided[0]]} 1개 시점만 제공됐습니다. 나머지 시점에서만 관찰 가능한 항목은 "관찰 불가"로 처리하고 note에 명시하세요.`
      : "* 두 시점이 모두 제공됐습니다. 각 시점의 강점을 활용해 종합 판정하세요.");

  const regionBlock = renderRegionReports(regionReports);

  const parts: Content["parts"] = [
    { text: hintBlock },
    { text: viewsBlock },
    ...(regionBlock ? [{ text: regionBlock }] : []),
    ...buildMediaParts(videos, frames),
    { text: "\n위 시점들과 분석관 보고서를 모두 종합해 헤드코치 판정 JSON만 출력하세요." },
  ];

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });
  const obj = parseJson(result.response.text()) as Record<string, unknown>;

  const allowedClubs: ClubType[] = ["driver", "iron", "approach"];

  // 1) 정형 관찰 표 추출 (LLM clubScores 출력은 무시)
  const observations = (obj.clubObservations ?? null) as Record<string, string> | null;

  // 2) 서버측 가중 분류기로 클럽 결정. LLM clubType/clubScores는 fallback 용도.
  const classification = classifyClubFromObservations(observations);

  let clubType: ClubType;
  let clubConfidence: number;
  let voteScores: Record<ClubType, number>;

  if (clubHint) {
    // 사용자 지정 최우선
    clubType = clubHint;
    clubConfidence = 1.0;
    voteScores = classification?.scores ?? { driver: 0, iron: 0, approach: 0 };
  } else if (classification) {
    // 서버 가중 분류기 결과 사용
    clubType = classification.clubType;
    clubConfidence = classification.confidence;
    voteScores = classification.scores;
  } else {
    // 관찰이 너무 부족 → LLM 출력을 fallback으로 사용
    clubType = (allowedClubs.includes(obj.clubType as ClubType)
      ? (obj.clubType as ClubType)
      : "iron") as ClubType;
    clubConfidence = Math.max(0, Math.min(1, Number(obj.clubConfidence ?? 0.4)));
    voteScores = { driver: 0, iron: 0, approach: 0 };
  }

  const cuesRaw = obj.clubCues;
  const clubCues = Array.isArray(cuesRaw)
    ? cuesRaw.map((c) => String(c).trim()).filter(Boolean).slice(0, 6)
    : [];
  const voteSum = voteScores.driver + voteScores.iron + voteScores.approach;
  return {
    clubType,
    clubConfidence,
    clubCues: clubHint ? ["사용자가 직접 지정함"] : clubCues,
    clubObservations: observations ?? undefined,
    clubScores: voteSum > 0 ? voteScores : undefined,
    mechanicsScores: normalizeMechanics(obj.mechanicsScores),
    gradeRationale: String(obj.gradeRationale ?? "").trim(),
  };
}

async function runCoach(
  videos: UploadedVideo[],
  frames: ExtractedFrame[],
  coach: CoachPersona,
  judgement: HeadJudgement,
  grade: Grade,
  level: Level,
  regionReports: RegionReport[],
  previous: PreviousAnalysisContext | undefined,
  attempt: number,
  retryFeedback: string,
): Promise<CoachOutput> {
  const model = makeModel(
    buildCoachPrompt(coach, judgement, grade, level, regionReports, previous),
  );
  const parts: Content["parts"] = [];
  if (attempt > 1 && retryFeedback) {
    parts.push({
      text: `[헤드코치 재작성 요청 — 시도 ${attempt}/${MAX_REVIEW_ATTEMPTS}]\n이전 작성물이 헤드코치 리뷰를 통과하지 못했습니다.\n다음 피드백을 반영해서 다시 작성하세요:\n\n${retryFeedback}`,
    });
  }
  const viewsProvided = Array.from(new Set(videos.map((v) => v.view)));
  parts.push({
    text:
      `[제공된 시점] ${viewsProvided.map((v) => VIDEO_VIEW_LABEL[v]).join(" + ")}\n` +
      "측면샷은 스윙 플레인·자세각·임팩트에 강하고, 정면샷은 정렬·스웨이·체중 이동에 강합니다. 두 시점이 있으면 모두 활용하세요.",
  });
  parts.push(...buildMediaParts(videos, frames));
  parts.push({ text: "위 시점들을 종합해 코치 출력 JSON만 작성하세요." });
  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });
  return normalizeCoachOutput(parseJson(result.response.text()));
}

async function runReview(
  coach: CoachPersona,
  judgement: HeadJudgement,
  grade: Grade,
  level: Level,
  coachOutput: CoachOutput,
  attempt: number,
): Promise<ReviewResult> {
  // 리뷰는 텍스트 품질·규칙 준수 검증이라 영상 불필요 (비용/시간 절약)
  const model = makeModel(buildReviewPrompt(coach, judgement, grade, level, coachOutput, attempt));
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: "위 코치 출력물을 채점한 리뷰 JSON만 출력하세요." }],
      },
    ],
  });
  return normalizeReview(parseJson(result.response.text()), attempt);
}
