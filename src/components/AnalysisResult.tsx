"use client";

import type { CoachPersona } from "@/lib/coaches";
import type {
  AnalysisRecord,
  Grade,
  ProgressDelta,
  SwingPoint,
} from "@/lib/types";

interface Props {
  data: {
    record: AnalysisRecord;
    delta: ProgressDelta;
    coach: CoachPersona;
    headCoach: CoachPersona;
    labels: { club: string; grade: string };
  };
}

const DIRECTION_LABEL: Record<ProgressDelta["direction"], string> = {
  up: "▲ 상승",
  down: "▼ 하락",
  same: "= 유지",
  new: "★ 첫 분석",
};

const DIRECTION_COLOR: Record<ProgressDelta["direction"], string> = {
  up: "text-emerald-700 bg-emerald-50",
  down: "text-rose-700 bg-rose-50",
  same: "text-slate-700 bg-slate-100",
  new: "text-amber-700 bg-amber-50",
};

function PointList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "good" | "bad" | "drill";
  items: SwingPoint[];
}) {
  const palette: Record<typeof tone, string> = {
    good: "border-emerald-200 bg-emerald-50/50",
    bad: "border-rose-200 bg-rose-50/50",
    drill: "border-sky-200 bg-sky-50/50",
  };
  return (
    <div className={`rounded-xl border p-4 ${palette[tone]}`}>
      <h4 className="text-sm font-semibold text-fairway-900">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-fairway-700/70">언급된 항목 없음</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((p, i) => (
            <li key={i} className="text-sm leading-relaxed">
              <span className="font-medium">{p.title}</span>
              {p.detail && <span className="text-fairway-700/80"> — {p.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnalysisResult({ data }: Props) {
  const { record, delta, coach, headCoach, labels } = data;
  const a = record.analysis;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-fairway-900 p-6 text-white shadow-md">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-fairway-100/70">
              {headCoach.name} 판정
            </div>
            <h2 className="mt-1 text-2xl font-bold">
              {labels.club} · {labels.grade} LV-{a.level}
            </h2>
            <p className="mt-1 text-sm text-fairway-100/80">
              {a.oneLineSummary}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${DIRECTION_COLOR[delta.direction]}`}
          >
            {DIRECTION_LABEL[delta.direction]}
            {delta.previous &&
              ` · 지난번 ${gradeKR(delta.previous.grade)} LV-${delta.previous.level}`}
          </span>
        </div>
        <p className="mt-3 text-xs text-fairway-100/70">
          판정 근거: {a.gradeRationale}
        </p>
      </div>

      <div className="rounded-2xl border border-fairway-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-fairway-500 text-white flex items-center justify-center font-bold">
            {coach.name.slice(-1)}
          </div>
          <div>
            <div className="text-sm font-semibold text-fairway-900">
              {coach.name} · {coach.title}
            </div>
            <div className="text-xs text-fairway-700/70">{coach.vibe}</div>
          </div>
        </div>
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-fairway-900">
          {a.coachMessage}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <PointList title="잘하고 있는 점" tone="good" items={a.strengths} />
        <PointList title="짚어야 할 점" tone="bad" items={a.weaknesses} />
        <PointList title="바로 해볼 드릴" tone="drill" items={a.drills} />
      </div>

      <div className="rounded-xl border border-fairway-100 bg-fairway-50 p-4 text-sm text-fairway-900">
        <strong>변화 노트.</strong> {delta.note}
      </div>
    </section>
  );
}

function gradeKR(g: Grade): string {
  return { beginner: "골린이", amateur: "아마추어", semipro: "세미프로", pro: "프로" }[g];
}
