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

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-pro";

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.");
  return k;
}

const SYSTEM_PROMPT = `당신은 한국 스크린골프 환경에서 촬영된 스윙 영상을 분석하는 전문 AI 골프 코치입니다.
다음 절차를 반드시 따릅니다.

1) 클럽 자동 인식
   - 영상에서 사용된 클럽을 driver(드라이버) / iron(아이언) / approach(어프로치·웨지)
     중 하나로 판정하세요.
   - 어드레스 자세, 클럽 헤드 길이/크기, 볼 위치, 스윙 길이, 티 사용 여부 등을 근거로
     판단하고 clubConfidence(0~1)를 함께 제시합니다.

2) 등급/단계 판정
   - 등급: beginner(골린이) < amateur(아마추어) < semipro(세미프로) < pro(프로)
   - 각 등급마다 LV-1, LV-2, LV-3 단계가 존재합니다(LV-3가 그 등급에서 가장 높음).
   - 어드레스 안정성, 백스윙 플레인, 탑 포지션, 다운스윙 시퀀스, 임팩트 자세,
     팔로우스루/피니시, 템포·리듬·균형을 종합 평가합니다.
   - 한 사람의 등급은 ${HEAD_COACH.name}(${HEAD_COACH.title})이 결정합니다.
     ${HEAD_COACH.voiceGuide}

3) 코치 메시지 생성
   - 판정된 등급의 전담 코치 페르소나로 사용자에게 직접 말합니다.
   - 다정하지만 정확합니다. 칭찬 1~2개 → 핵심 지적 1~2개 → 즉시 시도해볼
     드릴/체크포인트 1~2개 순서로 자연스럽게 이어집니다.
   - 등급에 맞는 어휘 수준을 사용합니다(골린이에는 비유와 쉬운 말,
     세미프로·프로에는 각도/패스/플레인 같은 구체 용어).

4) 출력은 반드시 아래 JSON 스키마만 출력합니다(코드펜스 금지, 설명 텍스트 금지):
{
  "clubType": "driver" | "iron" | "approach",
  "clubConfidence": number,
  "grade": "beginner" | "amateur" | "semipro" | "pro",
  "level": 1 | 2 | 3,
  "gradeRationale": string,
  "strengths": [{ "title": string, "detail": string }, ...],
  "weaknesses": [{ "title": string, "detail": string }, ...],
  "drills": [{ "title": string, "detail": string }, ...],
  "coachMessage": string,
  "oneLineSummary": string
}

strengths/weaknesses/drills는 각각 2~3개를 권장합니다. 한국어로 작성합니다.`;

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

  const contents: Content[] = [
    {
      role: "user",
      parts: [
        { text: coachInstruction() },
        { text: buildContextBlock({ nickname: input.nickname, history: input.history }) },
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
    return v
      .map((p) => ({
        title: String((p as { title?: unknown }).title ?? "").trim(),
        detail: String((p as { detail?: unknown }).detail ?? "").trim(),
      }))
      .filter((p) => p.title || p.detail);
  };

  return {
    clubType,
    clubConfidence: Math.max(0, Math.min(1, Number(obj.clubConfidence ?? 0.6))),
    grade,
    level,
    gradeRationale: String(obj.gradeRationale ?? "").trim(),
    strengths: ptArr("strengths"),
    weaknesses: ptArr("weaknesses"),
    drills: ptArr("drills"),
    coachMessage: String(obj.coachMessage ?? "").trim(),
    oneLineSummary: String(obj.oneLineSummary ?? "").trim().slice(0, 120),
  };
}
