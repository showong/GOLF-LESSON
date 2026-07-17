"use client";

import type { CoachPersona } from "@/lib/coaches";
import SkeletonPhaseStrip, {
  type SkeletonSource,
} from "@/components/SkeletonPhaseStrip";
import {
  FREQUENCY_LABEL,
  MECHANICS_LABEL,
  type AnalysisRecord,
  type Grade,
  type HomeworkCheck,
  type MechanicsDim,
  type MechanicsScore,
  type ProgressDelta,
  type ReviewResult,
  type SwingPoint,
  type VideoRecommendation,
} from "@/lib/types";

interface ProgressInfo {
  weighted: number | null;
  nextAt: number | null;
  toNext: number | null;
  nextLabel: string | null;
  dimensionDeltas:
    | { dim: MechanicsDim; prev: number | null; current: number | null }[]
    | null;
  /** 판독 범위 부족으로 게이지를 신뢰할 수 없는 상태 */
  coverageCapped?: boolean;
}

interface Props {
  data: {
    record: AnalysisRecord;
    delta: ProgressDelta;
    coach: CoachPersona;
    headCoach: CoachPersona;
    progress?: ProgressInfo;
    labels: { club: string; grade: string };
  };
  skeletonSources?: SkeletonSource[];
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
                    {p.frequency && (
                      <span
                        className={`mr-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-bold ${
                          p.frequency === "habitual"
                            ? "bg-rose-600 text-white"
                            : p.frequency === "intermittent"
                              ? "bg-amber-500 text-white"
                              : "bg-violet-600 text-white"
                        }`}
                      >
                        {FREQUENCY_LABEL[p.frequency].split(" ")[0]}
                      </span>
                    )}
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
                    {p.evidence && (
                      <p className="mt-1 rounded bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-fairway-700/80">
                        🔍 관찰 근거: {p.evidence}
                      </p>
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

export default function AnalysisResult({ data, skeletonSources = [] }: Props) {
  const { record, delta, coach, headCoach, labels, progress } = data;
  const a = record.analysis;
  const confidence = Math.round(a.clubConfidence * 100);
  const lowConfidence = a.clubConfidence < 0.6;

  return (
    <section className="space-y-4 sm:space-y-5">
      <div className="rounded-2xl bg-fairway-900 p-5 text-white shadow-md sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-fairway-100/70">
              {headCoach.name} 판정
            </div>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
              {labels.club} · {labels.grade} LV-{a.level}
              {a.provisional && (
                <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
                  잠정
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-fairway-100/80">
              {a.oneLineSummary}
            </p>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${DIRECTION_COLOR[delta.direction]}`}
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
          {a.views && a.views.length > 0 && (
            <span className="rounded bg-fairway-700/60 px-2 py-0.5 text-fairway-100">
              분석 시점:{" "}
              {a.views
                .map((v) => (v === "side" ? "측면샷" : "정면샷"))
                .join(" + ")}
            </span>
          )}
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
        {a.provisional && a.provisionalReason && (
          <p className="mt-2 rounded bg-amber-500/20 px-2 py-1 text-[11px] leading-relaxed text-amber-100">
            <strong>잠정 등급인 이유.</strong> {a.provisionalReason}
          </p>
        )}
        {a.views && a.views.length === 1 && (
          <p className="mt-2 rounded bg-fairway-700/50 px-2 py-1 text-[11px] leading-relaxed text-fairway-100/90">
            {a.views[0] === "side"
              ? "💡 정면샷을 함께 올리면 스웨이·정렬·체중 이동처럼 측면에서 안 보이는 항목까지 판독할 수 있어요."
              : "💡 측면샷을 함께 올리면 스윙 플레인·척추각·임팩트처럼 정면에서 안 보이는 항목까지 판독할 수 있어요."}
          </p>
        )}
        {a.videoQuality && a.videoQuality.length > 0 && (
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {a.videoQuality.map((q) => (
              <div
                key={q.view}
                className={`rounded px-2 py-1.5 text-[10px] leading-relaxed ${
                  q.passed
                    ? "bg-emerald-500/15 text-emerald-100"
                    : "bg-amber-500/20 text-amber-100"
                }`}
              >
                <strong>{q.view === "side" ? "측면" : "정면"} 품질</strong>
                {` · ${q.width}×${q.height} · ${Math.round(q.fps)}fps · ${q.durationSec.toFixed(1)}초`}
                {q.warnings.length > 0 && ` · ${q.warnings.join(" / ")}`}
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-fairway-100/70">
          판정 근거: {a.gradeRationale}
        </p>
      </div>

      {skeletonSources.length > 0 && (
        <SkeletonPhaseStrip analysis={a} sources={skeletonSources} />
      )}

      {a.homeworkCheck && (
        <HomeworkCard homework={a.homeworkCheck} coachName={coach.name} />
      )}

      {a.session && <SessionCard session={a.session} />}

      <ClubObservationCard
        observations={a.clubObservations}
        scores={a.clubScores}
        clubType={a.clubType}
      />

      <MechanicsBreakdown
        scores={a.mechanicsScores}
        total={a.mechanicsTotal}
        weighted={a.mechanicsWeighted}
        calibrationNote={a.calibrationNote}
        progress={progress}
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

      <RecommendationStrip recommendations={a.recommendations} />

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
      <div
        className={`mt-3 grid gap-2 text-[11px] ${
          typeof review.breakdown.individuality === "number"
            ? "grid-cols-3 sm:grid-cols-6"
            : "grid-cols-5"
        }`}
      >
        <ReviewCell label="등급 적합" value={review.breakdown.gradeMatch} max={30} />
        <ReviewCell
          label="클럽 특화"
          value={review.breakdown.clubSpecific}
          max={typeof review.breakdown.individuality === "number" ? 15 : 20}
        />
        <ReviewCell
          label="매커니즘 일치"
          value={review.breakdown.mechanicsAlignment}
          max={typeof review.breakdown.individuality === "number" ? 10 : 20}
        />
        {typeof review.breakdown.individuality === "number" && (
          <ReviewCell
            label="개별성"
            value={review.breakdown.individuality}
            max={15}
          />
        )}
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
  weighted,
  calibrationNote,
  progress,
}: {
  scores: MechanicsScore[];
  total: number;
  weighted?: number;
  calibrationNote?: string;
  progress?: ProgressInfo;
}) {
  const deltaByDim = new Map(
    (progress?.dimensionDeltas ?? []).map((d) => [d.dim, d]),
  );
  // 판독 범위 부족(coverage cap) 시: 정규화 가중점수가 캡 등급과 모순되므로
  // 점수·게이지 대신 판독 확대 안내를 보여준다.
  const capped = progress?.coverageCapped === true;
  // 신버전: weighted가 있으면 가중 점수(0~30)를 진행바 기준으로 사용
  const hasWeighted = typeof weighted === "number" && !capped;
  const display = hasWeighted ? Math.round(weighted! * 10) / 10 : total;
  const max = hasWeighted ? 30 : 24;
  const pct = capped ? 0 : Math.round((display / max) * 100);
  const observedCount = scores.filter((s) => s.observable !== false).length;
  const averageConfidence = observedCount > 0
    ? Math.round(
        (scores
          .filter((s) => s.observable !== false)
          .reduce((sum, s) => sum + (s.confidence ?? 0.7), 0) /
          observedCount) * 100,
      )
    : 0;
  return (
    <div className="rounded-2xl border border-fairway-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fairway-900">
            매커니즘 채점 (헤드코치)
          </h3>
          <p className="text-xs text-fairway-700/70">
            {capped ? (
              <>
                판독된 항목이 부족해 점수·게이지 대신 <strong>등급 상한만 안내</strong>합니다.
                전신과 클럽 헤드가 모두 보이게 다시 촬영하면 정확한 점수를 드릴 수 있어요.
              </>
            ) : hasWeighted ? (
              <>
                기본기 ★ × 1.5 가중 = <strong>{display} / 30점</strong> ({pct}%)
                — 관찰 가능 항목을 기준으로 환산했습니다. 비가중 환산 {total} / 24점.
              </>
            ) : (
              <>
                8개 항목 × 0~3점 = 합계 {display} / 24점 ({pct}%) — 이 합계로
                등급/단계가 결정됩니다.
              </>
            )}
          </p>
          <p className="mt-1 text-[11px] text-fairway-700/70">
            판독 가능 {observedCount}/8항목 · 평균 신뢰도 {averageConfidence}% · 관찰 불가 항목은 점수에서 제외
          </p>
        </div>
        <div className="shrink-0 rounded-lg bg-fairway-900 px-3 py-1.5 text-sm font-bold text-white">
          {capped ? `판독 ${observedCount}/8` : `${display} / ${max}`}
        </div>
      </div>

      {!capped && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-fairway-100">
          <div
            className="h-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {progress && progress.toNext !== null && progress.nextLabel && (
        <div className="mt-3 rounded-lg border border-fairway-100 bg-fairway-50 px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-fairway-900">
              🎯 다음 단계: {progress.nextLabel}
            </span>
            <span className="font-bold text-fairway-700">
              {progress.toNext}점 남음
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-fairway-700/70">
            등급이 안 바뀌어도 가중 점수가 오르고 있다면 스윙은 늘고 있는 거예요.
          </p>
        </div>
      )}

      {calibrationNote && (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          {calibrationNote}
        </div>
      )}

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {scores.map((m) => {
          const isFundamental = ["address", "takeaway", "transition", "balance"].includes(m.dim);
          const d = deltaByDim.get(m.dim);
          const dimDelta = m.observable === false
            ? null
            : d && d.prev !== null && d.current !== null
              ? d.current - d.prev
              : null;
          return (
          <li
            key={m.dim}
            className={`rounded-lg border px-3 py-2 ${
              isFundamental
                ? "border-fairway-500/50 bg-fairway-50/40"
                : "border-fairway-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fairway-900">
                {isFundamental && (
                  <span className="mr-1 text-sand-500" title="기본기 (×1.5 가중)">★</span>
                )}
                {MECHANICS_LABEL[m.dim]}
                {dimDelta !== null && dimDelta !== 0 && (
                  <span
                    className={`ml-1.5 text-[10px] font-bold ${
                      dimDelta > 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {dimDelta > 0 ? `▲${dimDelta}` : `▼${Math.abs(dimDelta)}`}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                {m.observable === false ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    관찰 불가
                  </span>
                ) : (
                  <>
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
                  </>
                )}
              </span>
            </div>
            {m.observable !== false && typeof m.confidence === "number" && (
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                판독 신뢰도 {Math.round(m.confidence * 100)}%
              </p>
            )}
            {m.note && (
              <p className="mt-1 text-[11px] leading-relaxed text-fairway-700/80">
                {m.note}
              </p>
            )}
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecommendationStrip({
  recommendations,
}: {
  recommendations?: VideoRecommendation[];
}) {
  if (!recommendations || recommendations.length === 0) return null;
  return (
    <div className="rounded-2xl border border-fairway-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold text-fairway-900">
          오늘의 약점을 다룬 YouTube 영상
        </h3>
        <span className="text-[11px] text-fairway-700/60">
          화이트리스트 채널 우선
        </span>
      </div>
      <p className="mt-1 text-xs text-fairway-700/70">
        헤드코치가 짚은 핵심 포커스와 약점을 기준으로 검색한 결과예요.
      </p>
      {/* 모바일: 가로 스와이프(snap), sm 이상: 그리드 */}
      <div className="no-scrollbar mt-3 -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {recommendations.map((r) => (
          <a
            key={r.videoId}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`group block min-w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border transition hover:shadow-md sm:min-w-0 sm:shrink ${
              r.isWhitelisted
                ? "border-fairway-500 bg-fairway-50/40"
                : "border-fairway-100 bg-white"
            }`}
          >
            <div className="relative">
              {r.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.thumbnailUrl}
                  alt=""
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="aspect-video w-full bg-fairway-100" />
              )}
              {r.isWhitelisted && (
                <span className="absolute left-1.5 top-1.5 rounded bg-fairway-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  추천 채널
                </span>
              )}
            </div>
            <div className="p-3">
              <h4 className="line-clamp-2 text-sm font-semibold text-fairway-900 group-hover:text-fairway-700">
                {r.title}
              </h4>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-fairway-700/70">
                <span className="truncate">{r.channelTitle}</span>
                <span>{relativeDate(r.publishedAt)}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 1) return "오늘";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

const OBSERVATION_LABELS: Record<string, string> = {
  tee: "티 사용",
  ballPosition: "볼 위치",
  stanceWidth: "스탠스 폭",
  spineAngle: "척추 각",
  clubLength: "클럽 길이",
  headShape: "헤드 모양",
  swingArc: "스윙 호",
  swingTempo: "스윙 템포",
};

const CLUB_KR: Record<string, string> = {
  driver: "드라이버",
  iron: "아이언",
  approach: "어프로치",
};

function ClubObservationCard({
  observations,
  scores,
  clubType,
}: {
  observations?: Record<string, string>;
  scores?: Record<string, number>;
  clubType: string;
}) {
  if (!observations && !scores) return null;
  return (
    <div className="rounded-2xl border border-fairway-100 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-fairway-900">
        헤드코치의 관찰 (클럽 인식 근거)
      </h3>
      <p className="mt-1 text-xs text-fairway-700/70">
        영상에서 추출한 8개 단서를 모은 표예요. 단서 투표에서 가장 많은 표를 받은
        클럽이 인식 결과가 됩니다.
      </p>

      {observations && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {Object.entries(OBSERVATION_LABELS).map(([k, label]) => {
            const v = observations[k] ?? "관찰 불가";
            const dim = v === "관찰 불가";
            return (
              <li
                key={k}
                className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs ${
                  dim
                    ? "border-dashed border-fairway-100 text-fairway-700/50"
                    : "border-fairway-100 text-fairway-900"
                }`}
              >
                <span className="font-medium">{label}</span>
                <span>{v}</span>
              </li>
            );
          })}
        </ul>
      )}

      {scores && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-fairway-700/80">
            단서 투표 결과
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["driver", "iron", "approach"] as const).map((c) => {
              const cnt = scores[c] ?? 0;
              const isWinner = c === clubType;
              return (
                <div
                  key={c}
                  className={`rounded-md border px-2 py-1.5 text-center text-xs ${
                    isWinner
                      ? "border-fairway-700 bg-fairway-50 font-bold text-fairway-900"
                      : "border-fairway-100 text-fairway-700/70"
                  }`}
                >
                  <div>{CLUB_KR[c]}</div>
                  <div className="mt-0.5 text-base font-bold">{cnt}표</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const HOMEWORK_STYLE: Record<
  HomeworkCheck["verdict"],
  { label: string; badge: string; border: string; bg: string }
> = {
  improved: {
    label: "✅ 좋아졌어요",
    badge: "bg-emerald-600",
    border: "border-emerald-300",
    bg: "bg-emerald-50",
  },
  same: {
    label: "= 비슷해요",
    badge: "bg-slate-500",
    border: "border-slate-200",
    bg: "bg-slate-50",
  },
  regressed: {
    label: "⚠️ 살짝 후퇴",
    badge: "bg-rose-500",
    border: "border-rose-200",
    bg: "bg-rose-50",
  },
  not_observable: {
    label: "이번 영상으론 판단 어려움",
    badge: "bg-slate-400",
    border: "border-slate-200",
    bg: "bg-white",
  },
};

function HomeworkCard({
  homework,
  coachName,
}: {
  homework: HomeworkCheck;
  coachName: string;
}) {
  const s = HOMEWORK_STYLE[homework.verdict];
  return (
    <div className={`rounded-2xl border-2 ${s.border} ${s.bg} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider text-white ${s.badge}`}
        >
          📋 지난 숙제 검사
        </span>
        <span className="text-sm font-semibold text-fairway-900">
          {s.label}
        </span>
      </div>
      <p className="mt-2 text-xs text-fairway-700/70">
        지난번 #1 포커스: <strong>{homework.previousFocus}</strong>
      </p>
      {homework.comment && (
        <p className="mt-1.5 text-sm leading-relaxed text-fairway-900">
          {homework.comment}
          <span className="ml-1 text-xs text-fairway-700/60">— {coachName}</span>
        </p>
      )}
    </div>
  );
}

function FaultGroup({
  title,
  faults,
  badge,
  desc,
  swingCount,
}: {
  title: string;
  faults: { title: string; count: number }[];
  badge: string;
  desc: string;
  swingCount: number;
}) {
  return (
    <div className="rounded-lg border border-fairway-100 p-3">
      <div className="flex items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${badge}`}>
          {title}
        </span>
        <span className="text-[10px] text-fairway-700/60">{desc}</span>
      </div>
      {faults.length === 0 ? (
        <p className="mt-1.5 text-xs text-fairway-700/60">발견되지 않음 ✓</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {faults.map((fault) => (
            <li key={fault.title} className="text-xs text-fairway-900">
              · {fault.title}
              <span className="ml-1 text-fairway-700/60">
                ({fault.count}/{swingCount}회)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionCard({
  session,
}: {
  session: NonNullable<AnalysisRecord["analysis"]["session"]>;
}) {
  const score = session.consistencyScore;
  const tone =
    score >= 80
      ? { label: "반복성 좋음", bar: "bg-emerald-500", text: "text-emerald-700" }
      : score >= 50
        ? { label: "보통", bar: "bg-amber-500", text: "text-amber-700" }
        : { label: "일관성이 최우선 과제", bar: "bg-rose-500", text: "text-rose-700" };
  const maxW = Math.max(...session.perSwingWeighted, 1);

  return (
    <div className="rounded-2xl border border-fairway-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fairway-900">
          🔁 멀티샷 분석 (스윙 {session.swingCount}개)
        </h3>
        <span className={`text-sm font-bold ${tone.text}`}>
          {score}/100 · {tone.label}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-fairway-100">
        <div className={`h-full ${tone.bar}`} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-fairway-700/70">
        스윙 간 항목별 점수 편차 기반. 등급은 스윙 {session.swingCount}개의
        중앙값으로 판정되어 한 번의 좋은/나쁜 스윙에 흔들리지 않아요.
        {(session.sideVideoCount || session.frontVideoCount) &&
          ` 측면 ${session.sideVideoCount ?? 0}개 · 정면 ${session.frontVideoCount ?? 0}개를 함께 비교했습니다.`}
      </p>

      {/* 스윙별 가중 점수 미니 바 */}
      <div className="mt-3 flex items-end gap-1.5">
        {session.perSwingWeighted.map((w, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className="w-7 rounded-t bg-fairway-500/70"
              style={{ height: `${Math.max(6, (w / Math.max(30, maxW)) * 48)}px` }}
              title={`스윙 ${i + 1}: ${w}/30`}
            />
            <span
              className={`text-[9px] ${
                session.mismatchedSwings?.includes(i + 1)
                  ? "font-bold text-rose-600"
                  : "text-fairway-700/60"
              }`}
            >
              {i + 1}
            </span>
          </div>
        ))}
        <span className="ml-1 self-center text-[10px] text-fairway-700/50">
          스윙별 가중 점수
        </span>
      </div>
      {session.mismatchedSwings && session.mismatchedSwings.length > 0 && (
        <p className="mt-1.5 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
          ⚠️ 스윙 {session.mismatchedSwings.join(", ")}번은 선택한 클럽과 달라
          보여요. 같은 클럽 영상만 모아 다시 분석하면 더 정확해요.
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <FaultGroup
          title="공통 문제"
          badge="bg-rose-600"
          desc="스윙 60%↑ · 반복 패턴"
          faults={session.habitualFaults}
          swingCount={session.swingCount}
        />
        <FaultGroup
          title="간헐적"
          badge="bg-amber-500"
          desc="일부 스윙에서만"
          faults={session.intermittentFaults}
          swingCount={session.swingCount}
        />
        <FaultGroup
          title="크리티컬"
          badge="bg-violet-600"
          desc="빈도는 낮지만 구질에 직접 영향"
          faults={session.rareCriticalFaults}
          swingCount={session.swingCount}
        />
      </div>
    </div>
  );
}
