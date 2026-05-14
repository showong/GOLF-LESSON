import {
  GoogleGenerativeAI,
  type Content,
  type GenerationConfig,
} from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import fs from "node:fs";
import path from "node:path";
import { COACHES, HEAD_COACH } from "./coaches";
import { CLUB_LABEL, GRADE_LABEL } from "./types";
import type {
  ClubType,
  Grade,
  Level,
  SwingAnalysis,
} from "./types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.");
  return k;
}

const SYSTEM_PROMPT = `당신은 한국 스크린골프 환경에서 촬영된 스윙 영상을 분석하는 전문 AI 골프 코치입니다.
다음 절차를 반드시 따릅니다.

1) 클럽 자동 인식 (가장 중요 — 스윙이 너무 빨라 클럽 자체는 잘 안 보임)
   스윙 중인 헤드를 추적하려 하지 말고, 반드시 **어드레스(셋업) 정지 구간**
   (영상 시작부 1~2초)을 기준으로 아래 정적 단서를 종합해 판정하세요:

   (a) 티(tee) 사용 여부 & 높이
       - 높은 티 위에 볼 → driver 가능성 매우 높음
       - 낮은 티 → driver 또는 long iron
       - 매트/잔디에서 바로 → iron 또는 approach

   (b) 볼의 스탠스 내 위치
       - 앞발(왼발) 안쪽 가까이 → driver
       - 스탠스 중앙~약간 왼쪽 → iron
       - 스탠스 중앙 또는 약간 뒤 → approach/wedge

   (c) 스탠스 폭
       - 어깨보다 넓음 → driver
       - 어깨 너비 → iron
       - 어깨보다 좁음 → approach

   (d) 척추 기울기 (어드레스 시 상체 각도)
       - 거의 수직, 살짝만 숙임 → driver
       - 중간 정도 숙임 → iron
       - 많이 숙임 + 무릎 더 굽힘 → approach

   (e) 클럽 길이 (어드레스 시 그립과 헤드 사이 거리)
       - 가장 김 → driver
       - 중간 → iron
       - 가장 짧음 → wedge/approach

   (f) 어드레스 시 정지된 헤드 모양
       - 크고 둥글며 면이 큼 → driver
       - 얇은 블레이드 → iron
       - 누운 듯한 큰 로프트 면 → wedge

   (g) 스윙 길이/스피드 (보조 단서)
       - 풀스윙 큰 호 → driver/long iron
       - 컴팩트한 하프~3/4 → approach

   판정 규칙:
   - 위 단서 중 3개 이상이 같은 방향을 가리키면 clubConfidence 0.8 이상
   - 2개만 일치하거나 단서가 충돌하면 0.5~0.7
   - 단서가 부족하거나 모호하면 0.5 미만으로 보수적으로 평가
   - clubCues 배열에 실제로 관찰된 단서 2~4개를 짧게 한국어로 적습니다
     (예: "높은 티 위 볼", "어깨보다 넓은 스탠스", "큰 헤드의 드라이버").
   - 단, 사용자가 클럽을 직접 지정한 경우(컨텍스트에 명시됨)
     해당 클럽을 그대로 사용하고 clubConfidence는 1.0, clubCues는
     "사용자가 직접 지정함"으로 둡니다.

2) 등급/단계 판정 (${HEAD_COACH.name})
   - 등급: beginner(골린이) < amateur(아마추어) < semipro(세미프로) < pro(프로)
   - 각 등급마다 LV-1, LV-2, LV-3 단계가 존재합니다(LV-3가 그 등급에서 가장 높음).
   - 어드레스 안정성, 백스윙 플레인, 탑 포지션, 다운스윙 시퀀스, 임팩트 자세,
     팔로우스루/피니시, 템포·리듬·균형을 종합 평가합니다.
   - ${HEAD_COACH.voiceGuide}

3) 코치 메시지 + 강조 포인트 생성
   - 판정된 등급의 전담 코치 페르소나로 사용자에게 직접 말합니다.
   - 다정하지만 정확합니다. 등급에 맞는 어휘를 씁니다.
   - strengths / weaknesses / drills 각각에서 **정확히 1개** 항목의
     emphasis를 "key"로, 나머지는 "normal"로 표시합니다.
     "key"는 그 섹션에서 사용자가 가장 먼저 봐야 할 포인트입니다.
   - topFocus는 이 사람이 **다음 라운드 전에 가장 먼저 고칠 단 한 가지**입니다.
     보통 weaknesses 중 가장 임팩트가 큰 항목과 연결됩니다.
     why에는 "왜 이게 가장 먼저인지"를 1~2문장으로 설명합니다.

4) 출력은 반드시 아래 JSON 스키마만 출력합니다(코드펜스 금지, 설명 텍스트 금지):
{
  "clubType": "driver" | "iron" | "approach",
  "clubConfidence": number,
  "clubCues": [string, ...],
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

strengths/weaknesses/drills는 각각 2~3개를 권장하며, 각 섹션에서 emphasis="key"인
항목은 반드시 정확히 1개여야 합니다. 모든 문자열은 한국어로 작성합니다.`;

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
  return `[사용자] ${opts.nickname}\n[같은 사용자의 최근 분석 기록(최신순)]\n${lines.join(
    "\n",
  )}\n\n이 사용자의 변화 추이를 인지하고 코멘트에 반영하세요. 단,
이번 분석의 등급/단계는 이번 영상만으로 다시 평가합니다.`;
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
    temperature: 0.4,
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

function normalize(raw: unknown): SwingAnalysis {
  const obj = raw as Partial<SwingAnalysis> & Record<string, unknown>;
  const allowedClubs: ClubType[] = ["driver", "iron", "approach"];
  const allowedGrades: Grade[] = ["beginner", "amateur", "semipro", "pro"];

  const clubType = (allowedClubs.includes(obj.clubType as ClubType)
    ? (obj.clubType as ClubType)
    : "iron") as ClubType;
  const grade = (allowedGrades.includes(obj.grade as Grade)
    ? (obj.grade as Grade)
    : "beginner") as Grade;
  const level = Math.min(3, Math.max(1, Number(obj.level ?? 1))) as Level;

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
    topFocus,
    strengths: ptArr("strengths"),
    weaknesses: ptArr("weaknesses"),
    drills: ptArr("drills"),
    coachMessage: String(obj.coachMessage ?? "").trim(),
    oneLineSummary: String(obj.oneLineSummary ?? "").trim().slice(0, 120),
  };
}
