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
  CLUB_LABEL,
  GRADE_LABEL,
  MECHANICS_DIMENSIONS,
  MECHANICS_LABEL,
  scoreToGradeLevel,
} from "./types";
import type {
  ClubType,
  Grade,
  Level,
  MechanicsDim,
  MechanicsScore,
  ReviewBreakdown,
  ReviewResult,
  SwingAnalysis,
  SwingFocus,
  SwingPoint,
} from "./types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const MAX_REVIEW_ATTEMPTS = 3;
const PASS_THRESHOLD = 90;

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.");
  return k;
}

const RUBRIC = `
[8개 매커니즘 항목 — 각 0~3점, 합계 0~24점. 보수적으로 매김]

A) address (어드레스/셋업) [기본기 가중치 ★]
   3=그립·정렬·볼 위치·자세각 모두 안정 / 2=한두 군데 미세 편차
   1=그립 또는 볼 위치 분명한 결함 1~2개 / 0=셋업 전반이 흐트러짐

B) takeaway (테이크어웨이~백스윙 플레인) [기본기 가중치 ★]
   3=한 동작처럼 플레인 위로 / 2=약간 편차 후 복귀
   1=인사이드/아웃사이드 픽업 분명 / 0=손목·허리 회전 없음

C) top (탑 포지션)
   3=좌측 팔 곧음, 셔프트 평행 / 2=살짝 짧거나 길지만 컨트롤
   1=오버스윙·과소 백스윙, 손 위치 흔들림 / 0=좌측 팔 크게 굽음, 크로스/레이드오프 심함

D) transition (전환·다운스윙 시퀀스) [기본기 가중치 ★]
   3=하체→상체→팔 순서 자연스러움 / 2=시퀀스 OK, 미세 캐스팅
   1=상체 우선·캐스팅 분명 / 0=클럽 바깥쪽으로 떨어짐, 일찍 풀림

E) impact (임팩트)
   3=헤드<손, 좌측 벽, 페이스 스퀘어 / 2=임팩트 안정, 미세 편차
   1=우측 체중 잔존, 페이스 오픈/클로즈 큼 / 0=헛스윙·뒷땅·탑볼 위험

F) finish (팔로우스루·피니시)
   3=균형 잡힌 풀 피니시 / 2=피니시 가지만 균형 흔들림
   1=피니시까지 못 가거나 척추 무너짐 / 0=거의 멈춤, 측면 휘청임

G) tempo (템포·리듬)
   3=백:다운≈3:1, 일정 호흡 / 2=약간 빠르거나 느림, 일관성 있음
   1=전환 급가속·과속 / 0=처음부터 끝까지 휙

H) balance (밸런스·축 안정성) [기본기 가중치 ★]
   3=백스윙 우측축, 다운 좌측축 명확. 스웨이 없음 / 2=작은 스웨이/리버스 피벗 기미
   1=명확한 스웨이/머리 이동 / 0=축 무너짐

[합계 → 등급/단계 매핑 — 코드에서 결정]
0-1 beginner LV1 / 2-3 LV2 / 4-5 LV3
6-7 amateur LV1 / 8-9 LV2 / 10-11 LV3
12-13 semipro LV1 / 14-15 LV2 / 16-17 LV3
18-19 pro LV1 / 20-21 LV2 / 22-24 LV3

[일관성 규칙]
- 같은 영상은 같은 점수가 나와야 함. 보고 있는 영상의 실제 동작 외에는 점수에 반영 금지.
- 사용자의 이전 기록, 선입견, 동기부여 의도의 가산점 모두 절대 금지.
- 영상에서 보이지 않는 항목은 보수적으로(중앙값 1점) 채우고 note에 한계 명시.
- 기본기 4항목(★ 표시: address, takeaway, transition, balance)이 등급의 핵심.
`;

// ---------- Stage 1: 헤드코치 판정 ----------

const HEAD_JUDGE_PROMPT = `당신은 ${HEAD_COACH.name}입니다. ${HEAD_COACH.voiceGuide}

[당신의 임무 — 단계 1/3: 클럽 인식 + 등급 판정]

1) 클럽 자동 인식 (정확도가 코치 배정의 근거가 되므로 매우 중요)
   다음 모든 단서를 종합해서 driver/iron/approach 중 하나로 판정합니다:

   [정지 단서 — 어드레스 1~2초]
   (a) 티 사용/높이  (b) 볼의 스탠스 내 위치  (c) 스탠스 폭
   (d) 척추 기울기   (e) 클럽 길이             (f) 헤드 모양/크기

   [동적 단서 — 스윙 중]
   (g) 스윙 궤적 호의 크기  (h) 스윙 스피드  (i) 페이스 회전량
   (j) 골퍼의 임팩트 자세(척추 각 변화, 체중 분포)

   판정 규칙:
   - 정지+동적 단서 합쳐 4개 이상 같은 방향 → clubConfidence ≥ 0.85
   - 3개 일치 → 0.7~0.85 / 2개 → 0.5~0.7 / 1개 이하 → < 0.5
   - clubCues에는 실제로 관찰한 단서 3~5개를 짧게 한국어로 기록
     (예: "큰 티 위 볼", "어깨보다 넓은 스탠스", "큰 호의 스윙 궤적", "헤드가 둥글고 큼")
   - 사용자가 클럽을 직접 지정한 경우만 clubConfidence=1.0, clubCues=["사용자가 직접 지정함"]

2) 매커니즘 8항목 채점 (보수적 채점 원칙)
${RUBRIC}

   기본기 4항목(★: address, takeaway, transition, balance)에 특히 엄격하게.
   기본기 항목 중 하나라도 2점 미만이면 등급이 amateur 이상으로 올라가기 어렵습니다.

3) gradeRationale: 어떤 기본기 항목이 점수를 끌어내렸는지/끌어올렸는지 2~3문장.

[출력 JSON — 이 형식만, 코드펜스/설명 금지]
{
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

function buildCoachPrompt(
  coach: CoachPersona,
  judgement: HeadJudgement,
  grade: Grade,
  level: Level,
): string {
  const weakest = [...judgement.mechanicsScores]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((m) => `${MECHANICS_LABEL[m.dim]}(${m.score}/3): ${m.note}`)
    .join("\n  - ");

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

[당신의 클럽 특화 코칭 포인트 — ${CLUB_LABEL[judgement.clubType]}]
${coach.clubFocus[judgement.clubType]}

이 영상을 다시 자세히 보고, 위 클럽 특화 포인트에 비춰서 분석/티칭하세요.

[드릴 처방 — 절대 규칙. 위반 시 헤드코치 리뷰에서 드릴 적합성 0점]
- 모든 드릴은 반드시 **집(거실/방) 또는 회사(책상/회의실)** 에서 실행 가능해야 합니다.
- 골프 클럽 없이 가능하거나, 흔한 가정/사무 용품으로 대체 가능해야 합니다.
- 허용 도구만 사용: 거울, 의자, 벽, 책, 우산, 빈 페트병, 신문지, 양말 묶음, 손수건, 빗자루, 종이컵, 스마트폰 거치대
- 절대 금지: 골프 클럽 필수, 골프공 필요, 골프장/연습장 방문, 야외 활동, 골프 매트, 골프 그물, 임팩트 백
- 각 드릴 detail에는 "무엇을 / 몇 회 또는 몇 분 / 무엇을 체크하는지"를 반드시 포함.
- 드릴은 2~3개 권장.

[강조 포인트 규칙]
- strengths / weaknesses / drills 각 섹션에서 정확히 1개를 emphasis="key"로 표시.
- topFocus는 가장 점수가 낮은 항목과 직접 연결된, 다음 라운드 전 단 하나의 우선순위.

[출력 JSON — 이 형식만, 코드펜스/설명 금지]
{
  "topFocus": { "title": string, "detail": string, "why": string },
  "strengths":  [{ "title": string, "detail": string, "emphasis": "key" | "normal" }, ...2~3개],
  "weaknesses": [{ "title": string, "detail": string, "emphasis": "key" | "normal" }, ...2~3개],
  "drills":     [{ "title": string, "detail": string, "emphasis": "key" | "normal" }, ...2~3개],
  "coachMessage": string,
  "oneLineSummary": string (40자 이내)
}

모든 문자열은 한국어. 위 분량 규칙·금지어·드릴 규칙을 모두 지키세요.`;
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

2) 클럽 특화성 (20점)
   - ${CLUB_LABEL[judgement.clubType]}에 맞는 구체적 분석/티칭인가?
   - 일반론만 늘어놓으면 감점.

3) 매커니즘 일치 (20점)
   - 헤드코치가 짚은 가장 약한 항목을 정확히 짚었는가?
   - 강한 항목을 약점으로 짚으면 큰 감점.

4) 드릴 적합성 (20점)
   - 집/회사에서 가능한가? (절대 규칙)
   - 골프장/연습장 필요한 드릴 포함 시 0점.
   - 구체적으로 횟수·체크 포인트 명시되었는가?

5) 간결성·임팩트 (10점)
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
    "clubSpecific": 0-20,
    "mechanicsAlignment": 0-20,
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

function normalizePoints(
  raw: unknown,
): { title: string; detail: string; emphasis: "key" | "normal" }[] {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .map((p) => {
      const r = p as { title?: unknown; detail?: unknown; emphasis?: unknown };
      const emphasis: "key" | "normal" = r.emphasis === "key" ? "key" : "normal";
      return {
        title: String(r.title ?? "").trim(),
        detail: String(r.detail ?? "").trim(),
        emphasis,
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
  };
}

function normalizeReview(raw: unknown, attempt: number): ReviewResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const score = Math.max(0, Math.min(100, Math.round(Number(obj.score ?? 0))));
  const b = (obj.breakdown ?? {}) as Record<string, unknown>;
  const breakdown: ReviewBreakdown = {
    gradeMatch: Math.max(0, Math.min(30, Math.round(Number(b.gradeMatch ?? 0)))),
    clubSpecific: Math.max(0, Math.min(20, Math.round(Number(b.clubSpecific ?? 0)))),
    mechanicsAlignment: Math.max(
      0,
      Math.min(20, Math.round(Number(b.mechanicsAlignment ?? 0))),
    ),
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

export interface AnalyzeInput {
  nickname: string;
  filePath: string;
  mimeType: string;
  clubHint?: ClubType;
  history: {
    createdAt: string;
    clubType: ClubType;
    grade: Grade;
    level: Level;
    oneLineSummary: string;
  }[];
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

export async function analyzeSwingVideo(
  input: AnalyzeInput,
): Promise<SwingAnalysis> {
  const fileManager = new GoogleAIFileManager(apiKey());
  if (!fs.existsSync(input.filePath)) {
    throw new Error(`업로드된 파일을 찾을 수 없습니다: ${input.filePath}`);
  }
  const uploadResult = await fileManager.uploadFile(input.filePath, {
    mimeType: input.mimeType,
    displayName: path.basename(input.filePath),
  });

  let file = await fileManager.getFile(uploadResult.file.name);
  const start = Date.now();
  while (file.state === FileState.PROCESSING) {
    if (Date.now() - start > 120_000) {
      throw new Error("영상 전처리가 너무 오래 걸려 중단했습니다.");
    }
    await new Promise((r) => setTimeout(r, 2000));
    file = await fileManager.getFile(uploadResult.file.name);
  }
  if (file.state !== FileState.ACTIVE) {
    throw new Error(`Gemini 파일 상태가 비정상입니다: ${file.state}`);
  }

  try {
    // === Stage 1: 헤드코치 판정 ===
    const judgement = await runHeadJudge(file, input.clubHint);
    const mechanicsTotal = judgement.mechanicsScores.reduce(
      (s, m) => s + m.score,
      0,
    );
    const { grade, level } = scoreToGradeLevel(mechanicsTotal);
    const coach = COACHES[grade];

    // === Stage 2 + 3: 코치 티칭 ↔ 헤드코치 리뷰 루프 ===
    let coachOutput: CoachOutput | null = null;
    let review: ReviewResult | null = null;
    let retryFeedback = "";

    for (let attempt = 1; attempt <= MAX_REVIEW_ATTEMPTS; attempt++) {
      coachOutput = await runCoach(
        file,
        coach,
        judgement,
        grade,
        level,
        attempt,
        retryFeedback,
      );
      review = await runReview(coach, judgement, grade, level, coachOutput, attempt);
      if (review.passed) break;
      retryFeedback = review.feedback;
    }

    if (!coachOutput || !review) {
      throw new Error("코치 분석을 생성하지 못했습니다.");
    }

    return {
      clubType: judgement.clubType,
      clubConfidence: judgement.clubConfidence,
      clubCues: judgement.clubCues,
      grade,
      level,
      gradeRationale: judgement.gradeRationale,
      mechanicsScores: judgement.mechanicsScores,
      mechanicsTotal,
      topFocus: coachOutput.topFocus,
      strengths: coachOutput.strengths,
      weaknesses: coachOutput.weaknesses,
      drills: coachOutput.drills,
      coachMessage: coachOutput.coachMessage,
      oneLineSummary: coachOutput.oneLineSummary,
      review,
    };
  } finally {
    fileManager.deleteFile(uploadResult.file.name).catch(() => {});
  }
}

// ---------- Stage runners ----------

async function runHeadJudge(
  file: { uri: string; mimeType: string },
  clubHint?: ClubType,
): Promise<HeadJudgement> {
  const model = makeModel(HEAD_JUDGE_PROMPT);
  const hintBlock = clubHint
    ? `[사용자 지정 클럽] "${CLUB_LABEL[clubHint]}"로 고정. clubType="${clubHint}", clubConfidence=1.0, clubCues=["사용자가 직접 지정함"].`
    : `[클럽 자동 인식 필요] 정지+동적 단서를 모두 활용해 정확히 판정하세요.`;

  const contents: Content[] = [
    {
      role: "user",
      parts: [
        { text: hintBlock },
        { text: "아래 영상을 분석해 헤드코치 판정 JSON만 출력하세요." },
        { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
      ],
    },
  ];
  const result = await model.generateContent({ contents });
  const obj = parseJson(result.response.text()) as Record<string, unknown>;

  const allowedClubs: ClubType[] = ["driver", "iron", "approach"];
  const clubType = (allowedClubs.includes(obj.clubType as ClubType)
    ? (obj.clubType as ClubType)
    : "iron") as ClubType;
  const cuesRaw = obj.clubCues;
  const clubCues = Array.isArray(cuesRaw)
    ? cuesRaw.map((c) => String(c).trim()).filter(Boolean).slice(0, 6)
    : [];
  return {
    clubType: clubHint ?? clubType,
    clubConfidence: clubHint
      ? 1
      : Math.max(0, Math.min(1, Number(obj.clubConfidence ?? 0.6))),
    clubCues: clubHint ? ["사용자가 직접 지정함"] : clubCues,
    mechanicsScores: normalizeMechanics(obj.mechanicsScores),
    gradeRationale: String(obj.gradeRationale ?? "").trim(),
  };
}

async function runCoach(
  file: { uri: string; mimeType: string },
  coach: CoachPersona,
  judgement: HeadJudgement,
  grade: Grade,
  level: Level,
  attempt: number,
  retryFeedback: string,
): Promise<CoachOutput> {
  const model = makeModel(buildCoachPrompt(coach, judgement, grade, level));
  const parts: Content["parts"] = [];
  if (attempt > 1 && retryFeedback) {
    parts.push({
      text: `[헤드코치 재작성 요청 — 시도 ${attempt}/${MAX_REVIEW_ATTEMPTS}]\n이전 작성물이 헤드코치 리뷰를 통과하지 못했습니다.\n다음 피드백을 반영해서 다시 작성하세요:\n\n${retryFeedback}`,
    });
  }
  parts.push({ text: "이 영상에 대한 코치 출력 JSON만 작성하세요." });
  parts.push({ fileData: { mimeType: file.mimeType, fileUri: file.uri } });
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
