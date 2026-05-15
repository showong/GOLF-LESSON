"use client";

import type { CoachPersona } from "@/lib/coaches";
import {
  MECHANICS_LABEL,
  type AnalysisRecord,
  type Grade,
  type MechanicsScore,
  type ProgressDelta,
  type ReviewResult,
  type SwingPoint,
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

type Tone = "good" | "bad" | "drill";

const TONE_STYLES: Record<
  Tone,
  { section: string; keyBg: string; keyBorder: string; badge: string; bullet: string }
> = {
  good: {
    section: "border-emerald-200 bg-emerald-50/40",
    keyBg: "bg-emerald-100",
    keyBorder: "border-emerald-400",
    badge: "bg-emerald-600 text-white",
    bullet: "text-emerald-700",
  },
  bad: {
    section: "border-rose-200 bg-rose-50/40",
    keyBg: "bg-rose-100",
    keyBorder: "border-rose-400",
    badge: "bg-rose-600 text-white",
    bullet: "text-rose-700",
  },
  drill: {
    section: "border-sky-200 bg-sky-50/40",
    keyBg: "bg-sky-100",
    keyBorder: "border-sky-400",
    badge: "bg-sky-600 text-white",
    bullet: "text-sky-700",
  },
};

function PointList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: Tone;
  items: SwingPoint[];
}) {
  const s = TONE_STYLES[tone];
  return (
    <div className={`rounded-xl border p-4 ${s.section}`}>
      <h4 className="text-sm font-semibold text-fairway-900">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-fairway-700/70">언급된 항목 없음</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((p, i) => {
            const isKey = p.emphasis === "key";
            return (
              <li
                key={i}
                className={
                  isKey
                    ? `rounded-lg border-2 ${s.keyBorder} ${s.keyBg} p-3 shadow-sm`
                    : "rounded-md px-2 py-1"
                }
              >
                <div className="flex items-start gap-2">
                  {isKey ? (
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${s.badge}`}
                    >
                      핵심
                    </span>
                  ) : (
                    <span className={`mt-1 shrink-0 text-xs ${s.bullet}`}>•</span>
                  )}
                  <div className="text-sm leading-relaxed">
                    <span
                      className={
                        isKey
                          ? "font-bold text-fairway-900"
                          : "font-medium text-fairway-900"
                      }
                    >
                      {p.title}
                    </span>
                    {p.detail && (
                      <span className="text-fairway-700/80"> — {p.detail}</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AnalysisResult({ data }: Props) {
  const { record, delta, coach, headCoach, labels } = data;
  const a = record.analysis;
  const confidence = Math.round(a.clubConfidence * 100);
  const lowConfidence = a.clubConfidence < 0.6;

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

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded px-2 py-0.5 ${
              lowConfidence
                ? "bg-amber-500/30 text-amber-100"
                : "bg-fairway-700/60 text-fairway-100"
            }`}
          >
            클럽 인식 신뢰도 {confidence}%
          </span>
          {a.clubCues.length > 0 && (
            <span className="text-fairway-100/70">
              · 근거: {a.clubCues.join(" / ")}
            </span>
          )}
        </div>
        {lowConfidence && (
          <p className="mt-2 rounded bg-amber-500/20 px-2 py-1 text-[11px] text-amber-100">
            스윙이 빨라 자동 인식 신뢰도가 낮습니다. 결과 화면 위쪽 업로드 폼에서
            클럽을 직접 지정하면 더 정확한 코칭을 받을 수 있어요.
          </p>
        )}

        <p className="mt-3 text-xs text-fairway-100/70">
          판정 근거: {a.gradeRationale}
        </p>
      </div>

      <MechanicsBreakdown
        scores={a.mechanicsScores}
        total={a.mechanicsTotal}
      />

      <ReviewBadge review={a.review} coachName={coach.name} headCoachName={headCoach.name} />

      {(a.topFocus.detail || a.topFocus.why) && (
        <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100 p-5 shadow-md">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white">
              오늘의 #1 포커스
            </span>
            <h3 className="text-base font-bold text-amber-900">
              {a.topFocus.title}
            </h3>
          </div>
          {a.topFocus.detail && (
            <p className="mt-2 text-sm font-medium leading-relaxed text-amber-950">
              {a.topFocus.detail}
            </p>
          )}
          {a.topFocus.why && (
            <p className="mt-1.5 text-xs leading-relaxed text-amber-800/90">
              💡 {a.topFocus.why}
            </p>
          )}
        </div>
      )}

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

function scoreColor(s: number): string {
  if (s >= 3) return "bg-emerald-500";
  if (s >= 2) return "bg-sky-500";
  if (s >= 1) return "bg-amber-500";
  return "bg-rose-500";
}

function ReviewBadge({
  review,
  coachName,
  headCoachName,
}: {
  review: ReviewResult;
  coachName: string;
  headCoachName: string;
}) {
  const passed = review.passed;
  const palette = passed
    ? {
        ring: "border-emerald-300",
        bg: "bg-emerald-50",
        badge: "bg-emerald-600",
        title: "text-emerald-900",
      }
    : {
        ring: "border-amber-300",
        bg: "bg-amber-50",
        badge: "bg-amber-600",
        title: "text-amber-900",
      };
  return (
    <div className={`rounded-2xl border-2 ${palette.ring} ${palette.bg} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider text-white ${palette.badge}`}
          >
            {passed ? "헤드코치 승인" : "기준 미달 — 최종본 전달"}
          </span>
          <span className={`text-sm font-semibold ${palette.title}`}>
            {headCoachName} 리뷰: {review.score}/100점
          </span>
        </div>
        <span className="text-[11px] text-fairway-700/70">
          {coachName} · 시도 {review.attemptCount}회
        </span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 text-[11px]">
        <ReviewCell label="등급 적합" value={review.breakdown.gradeMatch} max={30} />
        <ReviewCell label="클럽 특화" value={review.breakdown.clubSpecific} max={20} />
        <ReviewCell
          label="매커니즘 일치"
          value={review.breakdown.mechanicsAlignment}
          max={20}
        />
        <ReviewCell label="드릴 적합" value={review.breakdown.drillFit} max={20} />
        <ReviewCell label="간결·임팩트" value={review.breakdown.conciseness} max={10} />
      </div>
      {!passed && review.feedback && (
        <p className="mt-3 rounded-md bg-white/60 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          <strong>헤드코치 메모.</strong> {review.feedback}
        </p>
      )}
    </div>
  );
}

function ReviewCell({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = Math.round((value / max) * 100);
  const tone =
    pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-sky-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="rounded-md border border-fairway-100 bg-white px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-fairway-700/80">{label}</span>
        <span className="font-bold text-fairway-900">
          {value}/{max}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-fairway-100">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MechanicsBreakdown({
  scores,
  total,
}: {
  scores: MechanicsScore[];
  total: number;
}) {
  const pct = Math.round((total / 24) * 100);
  return (
    <div className="rounded-2xl border border-fairway-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-fairway-900">
            매커니즘 채점 (헤드코치)
          </h3>
          <p className="text-xs text-fairway-700/70">
            8개 항목 × 0~3점 = 합계 {total} / 24점 ({pct}%) — 이 합계로
            등급/단계가 결정됩니다.
          </p>
        </div>
        <div className="rounded-lg bg-fairway-900 px-3 py-1.5 text-sm font-bold text-white">
          {total} / 24
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-fairway-100">
        <div
          className="h-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {scores.map((m) => (
          <li
            key={m.dim}
            className="rounded-lg border border-fairway-100 px-3 py-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fairway-900">
                {MECHANICS_LABEL[m.dim]}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`h-2 w-4 rounded-sm ${
                        i < m.score ? scoreColor(m.score) : "bg-fairway-100"
                      }`}
                    />
                  ))}
                </span>
                <span className="w-6 text-right text-xs font-bold text-fairway-900">
                  {m.score}/3
                </span>
              </span>
            </div>
            {m.note && (
              <p className="mt-1 text-[11px] leading-relaxed text-fairway-700/80">
                {m.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
