import {
  GoogleGenerativeAI,
  type Content,
  type GenerationConfig,
} from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import fs from "node:fs";
import path from "node:path";
import { COACHES, HEAD_COACH } from "./coaches";
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
  SwingAnalysis,
} from "./types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.");
  return k;
}

const RUBRIC = `
[8개 매커니즘 항목 — 각 0~3점, 합계 0~24점]

A) address (어드레스/셋업)
   3 = 그립·정렬·볼 위치·자세각이 모두 안정. 클럽 종류에 맞는 셋업.
   2 = 한두 군데 미세 편차. 라운드 영향은 작음.
   1 = 그립 또는 볼 위치 잘못 등 분명한 결함 1~2개.
   0 = 셋업 전반이 흐트러져 결과 일관성 자체가 어려움.

B) takeaway (테이크어웨이~백스윙 플레인)
   3 = 한 동작처럼 매끄럽게 클럽이 플레인 위로 올라감.
   2 = 약간의 안쪽/바깥쪽 편차는 있으나 본 플레인으로 복귀.
   1 = 인사이드 픽업 또는 아웃사이드 들어올림 분명.
   0 = 클럽이 손목 코크/허리 회전 없이 들어 올라감, 플레인 깨짐.

C) top (탑 포지션)
   3 = 좌측 팔 곧음, 손 위치 적정, 셔프트가 타깃에 평행에 가까움.
   2 = 살짝 짧거나 길지만 컨트롤 가능 범위.
   1 = 오버스윙 또는 너무 짧은 백스윙, 손 위치 흔들림.
   0 = 좌측 팔 크게 굽음, 셔프트가 크로스/레이드오프 심함.

D) transition (전환·다운스윙 시퀀스)
   3 = 하체 리드 → 상체 → 팔/클럽 순서로 자연스러운 시퀀싱.
   2 = 시퀀스는 보이지만 미세한 캐스팅/상체 우선 경향.
   1 = 상체 우선/캐스팅 분명, 클럽 패스 손실.
   0 = 다운스윙에서 클럽이 바깥쪽으로 떨어지거나 일찍 풀림 심각.

E) impact (임팩트)
   3 = 헤드가 손보다 약간 뒤, 좌측 체중·좌측 벽 형성, 페이스 스퀘어.
   2 = 임팩트 자세 안정, 미세 페이스 편차.
   1 = 우측 체중 잔존(헤드업·스웨이) 또는 페이스 오픈/클로즈 큼.
   0 = 헛스윙·뒷땅·탑볼 위험 자세, 균형 무너짐.

F) finish (팔로우스루·피니시)
   3 = 균형 잡힌 풀 피니시, 벨트 버클이 타깃, 우측 발끝 토.
   2 = 피니시 가지만 균형 살짝 흔들림.
   1 = 피니시까지 못 가거나 척추 무너짐.
   0 = 거의 멈춤, 측면 휘청임.

G) tempo (템포·리듬)
   3 = 백스윙:다운스윙 ≈ 3:1 비율, 일정한 호흡.
   2 = 약간 빠르거나 느림. 일관성은 있음.
   1 = 전환에서 급가속·과속, 리듬이 깨짐.
   0 = 처음부터 끝까지 휙 휘두름, 컨트롤 불가.

H) balance (밸런스·축 안정성)
   3 = 백스윙 우측 축, 다운 좌측 축 분명. 스웨이 없음.
   2 = 작은 스웨이/리버스 피벗 기미.
   1 = 명확한 스웨이 또는 머리 좌우 이동.
   0 = 축 자체가 무너져 임팩트 위치 예측 불가.

[합계 → 등급/단계 매핑 — 코드에서 결정적으로 계산하므로 grade/level은
이 매핑을 따라 출력하세요]
- 0-1   : beginner LV-1 (골린이 LV-1)
- 2-3   : beginner LV-2
- 4-5   : beginner LV-3
- 6-7   : amateur LV-1 (아마추어 LV-1)
- 8-9   : amateur LV-2
- 10-11 : amateur LV-3
- 12-13 : semipro LV-1 (세미프로 LV-1)
- 14-15 : semipro LV-2
- 16-17 : semipro LV-3
- 18-19 : pro LV-1 (프로 LV-1)
- 20-21 : pro LV-2
- 22-24 : pro LV-3

[일관성 규칙 — 매우 중요]
- 같은 영상은 같은 점수가 나와야 합니다. 보고 있는 영상의 실제 동작 외에는
  점수 산정에 어떤 것도 반영하지 마세요. 특히 다음을 절대 점수에 반영 금지:
  · 사용자의 이전 분석 기록(이력은 추이 코멘트 용도일 뿐)
  · "이 사람은 어차피 골린이일 것이다" 같은 선입견
  · 사용자에게 동기를 주려는 의도의 가산점/감산점
- 점수는 "이 매커니즘이 객관적으로 어느 수준인가"에만 근거합니다.
- 영상 길이가 짧거나 특정 구간이 안 보이면 그 항목은 보이는 정보만으로
  보수적으로(중앙값에 가까운 값으로) 매기고 note에 한계를 명시합니다.
`;

const SYSTEM_PROMPT = `당신은 한국 스크린골프 환경에서 촬영된 스윙 영상을 분석하는
전문 AI 골프 코치 헤드 ${HEAD_COACH.name}입니다. ${HEAD_COACH.voiceGuide}

[전체 절차]
1) 클럽 자동 인식 → 2) 8항목 매커니즘 채점 → 3) 합계로 등급/단계 결정
→ 4) 강조 포인트와 코치 메시지 생성. 어떤 단계도 건너뛰지 않습니다.

---

[1) 클럽 자동 인식]
스윙 중 헤드는 너무 빨라 잘 안 보이므로, 반드시 **어드레스(셋업) 정지 구간**
(영상 시작 1~2초)을 기준으로 다음 정적 단서를 종합해 판정하세요.

(a) 티 사용/높이  · (b) 볼의 스탠스 내 위치  · (c) 스탠스 폭
(d) 척추 기울기   · (e) 클럽 길이             · (f) 헤드 모양
(g) 스윙 길이(보조)

판정 규칙:
- 단서 3개 이상이 같은 방향이면 clubConfidence ≥ 0.8
- 2개만 일치하거나 충돌하면 0.5~0.7
- 부족/모호하면 0.5 미만으로 보수적
- clubCues 배열에 실제 관찰한 단서 2~4개를 짧게 한국어로 기록
  (예: "높은 티 위 볼", "어깨보다 넓은 스탠스")
- 사용자가 클럽을 직접 지정한 경우 그대로 사용 + clubConfidence=1.0 + clubCues=["사용자가 직접 지정함"]

---

[2) 매커니즘 8항목 채점 — 헤드코치의 핵심 작업]
${RUBRIC}

mechanicsScores 배열에는 다음 순서로 정확히 8개 항목을 모두 포함합니다:
${MECHANICS_DIMENSIONS.map((d) => `  - dim: "${d}"  (${MECHANICS_LABEL[d]})`).join("\n")}

각 항목은 { "dim": string, "score": 0|1|2|3, "note": "한국어로 한두 줄 근거" }.
note는 무엇이 보여서 그 점수를 줬는지 구체적인 관찰 사실 1가지 이상을 적습니다
(예: "탑에서 좌측 팔이 굽음, 셔프트가 레이드오프됨").

mechanicsTotal은 8개 score의 합. 합계 → 등급/단계는 위 매핑표를 그대로 따릅니다.
gradeRationale에는 "어떤 항목이 점수를 끌어내렸는지"를 두 문장 정도로 요약합니다.

---

[3) 코치 메시지 + 강조 포인트]
- 판정된 등급의 전담 코치 페르소나로 사용자에게 직접 말합니다.
- 다정하지만 정확합니다. 등급에 맞는 어휘.
- strengths / weaknesses / drills 각각에서 **정확히 1개** 항목의 emphasis="key",
  나머지는 "normal". "key"는 그 섹션의 가장 중요한 항목.
- topFocus는 다음 라운드 전에 **가장 먼저 고칠 단 한 가지**.
  보통 weaknesses 중 score가 가장 낮은 항목과 연결됩니다.
  why에는 왜 이게 가장 먼저인지 1~2문장.

---

[4) 출력 JSON 스키마 — 이 형식만 출력. 코드펜스/설명 텍스트 금지]
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
  "mechanicsTotal": number,
  "grade": "beginner" | "amateur" | "semipro" | "pro",
  "level": 1 | 2 | 3,
  "gradeRationale": string,
  "topFocus": { "title": string, "detail": string, "why": string },
  "strengths":  [{ "title": string, "detail": string, "emphasis": "key" | "normal" }, ...],
  "weaknesses": [{ "title": string, "detail": string, "emphasis": "key" | "normal" }, ...],
  "drills":     [{ "title": string, "detail": string, "emphasis": "key" | "normal" }, ...],
  "coachMessage": string,
  "oneLineSummary": string
}

strengths/weaknesses/drills는 각 2~3개. 각 섹션에서 emphasis="key"는 정확히 1개.
모든 문자열은 한국어. 모든 점수는 위 루브릭에 정확히 매핑된 0~3 정수.`;

function buildContextBlock(opts: {
  nickname: string;
  history: { createdAt: string; clubType: ClubType; grade: Grade; level: Level; oneLineSummary: string }[];
}): string {
  if (opts.history.length === 0) {
    return `[사용자] ${opts.nickname}\n[이전 기록] 없음 (첫 분석).`;
  }
  const lines = opts.history.map((h) => {
    const d = new Date(h.createdAt).toLocaleDateString("ko-KR");
    return `- ${d} · ${CLUB_LABEL[h.clubType]} · ${GRADE_LABEL[h.grade]} LV-${h.level} · ${h.oneLineSummary}`;
  });
  return `[사용자] ${opts.nickname}
[같은 사용자의 최근 분석 기록(최신순)]
${lines.join("\n")}

[중요] 위 이력은 coachMessage에서 변화 추이를 언급할 때만 참고하세요.
mechanicsScores 점수와 등급 판정에는 절대 영향을 주지 않습니다.
이번 영상만 보고 객관적으로 채점합니다.`;
}

function coachInstruction(): string {
  const blocks = (Object.keys(COACHES) as Grade[]).map((g) => {
    const c = COACHES[g];
    return `- ${GRADE_LABEL[g]}: ${c.name} (${c.title}) · ${c.vibe}\n  말투 가이드: ${c.voiceGuide}\n  집중 영역: ${c.focus.join(", ")}`;
  });
  return `[등급별 전담 코치]\n${blocks.join("\n")}`;
}

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

  // Gemini의 File API는 처음에 PROCESSING 상태이므로 ACTIVE가 될 때까지 폴링.
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

  const genAI = new GoogleGenerativeAI(apiKey());
  const generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    // 같은 영상에 같은 점수가 나오도록 결정적 출력에 가깝게 둠.
    temperature: 0.1,
    topP: 0.1,
    maxOutputTokens: 4096,
  };
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig,
  });

  const hintBlock = input.clubHint
    ? `[사용자 지정 클럽] 사용자가 이번 영상을 "${CLUB_LABEL[input.clubHint]}"로 직접 지정했습니다.\n자동 인식 단계는 건너뛰고 clubType="${input.clubHint}", clubConfidence=1.0,\nclubCues=["사용자가 직접 지정함"] 으로 고정합니다.`
    : `[클럽 자동 인식 필요] 사용자가 클럽을 지정하지 않았습니다. 어드레스 단서로 판정하세요.`;

  const contents: Content[] = [
    {
      role: "user",
      parts: [
        { text: coachInstruction() },
        { text: buildContextBlock({ nickname: input.nickname, history: input.history }) },
        { text: hintBlock },
        {
          text: "아래 영상을 분석해 위 JSON 스키마로만 응답하세요.",
        },
        {
          fileData: {
            mimeType: file.mimeType,
            fileUri: file.uri,
          },
        },
      ],
    },
  ];

  const result = await model.generateContent({ contents });
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");
    parsed = JSON.parse(cleaned);
  }

  // 파일은 분석 끝나면 정리.
  fileManager.deleteFile(uploadResult.file.name).catch(() => {});

  return normalize(parsed);
}

function normalizeMechanics(raw: unknown): MechanicsScore[] {
  const allowed = new Set<MechanicsDim>(MECHANICS_DIMENSIONS);
  const byDim = new Map<MechanicsDim, MechanicsScore>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const r = item as { dim?: unknown; score?: unknown; note?: unknown };
      const dim = String(r.dim ?? "") as MechanicsDim;
      if (!allowed.has(dim)) continue;
      const score = Math.max(0, Math.min(3, Math.round(Number(r.score ?? 0)))) as
        | 0
        | 1
        | 2
        | 3;
      byDim.set(dim, {
        dim,
        score,
        note: String(r.note ?? "").trim(),
      });
    }
  }
  // 누락된 항목은 1점(중앙값 하단)으로 보수적으로 채움.
  return MECHANICS_DIMENSIONS.map(
    (d) =>
      byDim.get(d) ?? {
        dim: d,
        score: 1 as const,
        note: "관찰 정보 부족으로 보수적으로 채움.",
      },
  );
}

function normalize(raw: unknown): SwingAnalysis {
  const obj = raw as Partial<SwingAnalysis> & Record<string, unknown>;
  const allowedClubs: ClubType[] = ["driver", "iron", "approach"];

  const clubType = (allowedClubs.includes(obj.clubType as ClubType)
    ? (obj.clubType as ClubType)
    : "iron") as ClubType;

  const mechanicsScores = normalizeMechanics(obj.mechanicsScores);
  const mechanicsTotal = mechanicsScores.reduce((s, m) => s + m.score, 0);
  // 점수 → 등급/단계는 코드에서 결정적으로 매핑. Gemini가 무엇을 출력했든 무시.
  const { grade, level } = scoreToGradeLevel(mechanicsTotal);

  const ptArr = (k: "strengths" | "weaknesses" | "drills") => {
    const v = obj[k];
    if (!Array.isArray(v)) return [];
    const cleaned = v
      .map((p) => {
        const raw = p as { title?: unknown; detail?: unknown; emphasis?: unknown };
        const emphasis: "key" | "normal" =
          raw.emphasis === "key" ? "key" : "normal";
        return {
          title: String(raw.title ?? "").trim(),
          detail: String(raw.detail ?? "").trim(),
          emphasis,
        };
      })
      .filter((p) => p.title || p.detail);
    // 안전장치: 섹션에 "key"가 0개거나 2개 이상이면 첫 항목만 key로 강제.
    const keyCount = cleaned.filter((p) => p.emphasis === "key").length;
    if (cleaned.length > 0 && keyCount !== 1) {
      cleaned.forEach((p, i) => {
        p.emphasis = i === 0 ? "key" : "normal";
      });
    }
    return cleaned;
  };

  const rawFocus = obj.topFocus as
    | { title?: unknown; detail?: unknown; why?: unknown }
    | undefined;
  const topFocus = {
    title: String(rawFocus?.title ?? "").trim() || "오늘의 핵심 포인트",
    detail: String(rawFocus?.detail ?? "").trim(),
    why: String(rawFocus?.why ?? "").trim(),
  };

  const cuesRaw = obj.clubCues;
  const clubCues = Array.isArray(cuesRaw)
    ? cuesRaw.map((c) => String(c).trim()).filter(Boolean).slice(0, 6)
    : [];

  return {
    clubType,
    clubConfidence: Math.max(0, Math.min(1, Number(obj.clubConfidence ?? 0.6))),
    clubCues,
    grade,
    level,
    gradeRationale: String(obj.gradeRationale ?? "").trim(),
    mechanicsScores,
    mechanicsTotal,
    topFocus,
    strengths: ptArr("strengths"),
    weaknesses: ptArr("weaknesses"),
    drills: ptArr("drills"),
    coachMessage: String(obj.coachMessage ?? "").trim(),
    oneLineSummary: String(obj.oneLineSummary ?? "").trim().slice(0, 120),
  };
}
