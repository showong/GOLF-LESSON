"use client";

import { useEffect, useState } from "react";
import { VIDEO_RETENTION_DAYS } from "@/lib/legal";
import type { AnalysisRecord, ClubType } from "@/lib/types";

interface Section {
  clubType: ClubType;
  label: string;
  records: AnalysisRecord[];
}

const GRADE_KR: Record<string, string> = {
  beginner: "골린이",
  amateur: "아마추어",
  semipro: "세미프로",
  pro: "프로",
};

export default function ProgressDashboard({
  nickname,
  refreshKey,
}: {
  nickname: string;
  refreshKey: number;
}) {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteAllRecords() {
    const confirmed = window.confirm(
      "영상, 분석 기록, 닉네임을 모두 삭제할까요?\n삭제한 기록은 되돌릴 수 없어요.",
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/user", { method: "DELETE" });
      if (!response.ok && response.status !== 401) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "기록을 삭제하지 못했습니다.");
      }
      try {
        localStorage.removeItem("golf-tutor:nickname");
        localStorage.removeItem("golf-tutor:consent-version");
      } catch {
        // 서버 기록과 쿠키는 이미 삭제됐다.
      }
      window.alert("모든 기록을 삭제했어요.");
      window.location.reload();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "기록을 삭제하지 못했습니다.");
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!nickname.trim()) {
      setSections(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const userResponse = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: nickname.trim() }),
          signal: controller.signal,
        });
        if (!userResponse.ok) throw new Error("사용자 세션 생성 실패");
        const historyResponse = await fetch("/api/history", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await historyResponse.json();
        setSections(historyResponse.ok ? (data.sections ?? null) : null);
      } catch {
        if (!controller.signal.aborted) setSections(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [nickname, refreshKey]);

  if (!nickname.trim()) return null;

  return (
    <section className="rounded-2xl border border-fairway-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h2 className="text-base font-semibold text-fairway-900">
          {nickname}님의 클럽별 변화 기록
        </h2>
        {loading && <span className="text-xs text-fairway-700/70">불러오는 중…</span>}
      </div>
      <p className="mt-1 text-sm text-fairway-700/80">
        같은 사용자가 업로드한 영상의 등급/단계 변화를 클럽별로 나눠서 보여드려요.
      </p>

      {/* 모바일: 가로 스와이프, sm 이상: 3열 그리드 */}
      <div className="no-scrollbar mt-4 -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:gap-4 sm:px-0">
        {sections?.map((s) => (
          <div
            key={s.clubType}
            className="min-w-[78%] shrink-0 snap-start sm:min-w-0 sm:shrink"
          >
            <ClubSection section={s} />
          </div>
        ))}
        {!sections &&
          ["드라이버", "아이언", "어프로치"].map((l) => (
            <div
              key={l}
              className="min-w-[78%] shrink-0 snap-start rounded-xl border border-dashed border-fairway-100 p-4 text-sm text-fairway-700/60 sm:min-w-0 sm:shrink"
            >
              {l} · 아직 분석 기록이 없어요.
            </div>
          ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-fairway-100 pt-3 text-xs text-fairway-700/70">
        <span>원본 영상은 업로드 {VIDEO_RETENTION_DAYS}일 후 자동 삭제돼요.</span>
        <button
          type="button"
          onClick={deleteAllRecords}
          disabled={deleting}
          className="min-h-[36px] rounded-lg border border-rose-200 px-3 py-1.5 font-semibold text-rose-700 active:bg-rose-50 disabled:opacity-50"
        >
          {deleting ? "삭제하는 중…" : "내 기록 전체 삭제"}
        </button>
      </div>
      {deleteError && <p className="mt-2 text-xs text-rose-700">{deleteError}</p>}
    </section>
  );
}

function ClubSection({ section }: { section: Section }) {
  const records = section.records;
  return (
    <div className="h-full rounded-xl border border-fairway-100 p-4">
      <h3 className="text-sm font-semibold text-fairway-900">
        {section.label}
      </h3>
      {records.length === 0 ? (
        <p className="mt-2 text-xs text-fairway-700/70">
          아직 이 클럽의 분석이 없어요.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {records.slice(0, 6).map((r, i) => {
            const next = records[i + 1];
            const arrow = direction(r, next);
            return (
              <li key={r.id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-fairway-900">
                    {GRADE_KR[r.grade]} LV-{r.level}
                    {r.analysis?.provisional && (
                      <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">
                        잠정
                      </span>
                    )}
                  </span>
                  <span className="text-fairway-700/60">
                    {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <div className="mt-0.5 text-fairway-700/80">
                  {r.oneLineSummary}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-fairway-700/60">
                  {typeof r.analysis?.mechanicsWeighted === "number" && (
                    <span className="font-semibold text-fairway-700">
                      가중 {Math.round(r.analysis.mechanicsWeighted * 10) / 10}/30
                    </span>
                  )}
                  {next && <span>이전 대비 {arrow}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const GRADE_RANK = ["beginner", "amateur", "semipro", "pro"];
function rank(grade: string, level: number) {
  return GRADE_RANK.indexOf(grade) * 3 + (level - 1);
}
function direction(current: AnalysisRecord, prev?: AnalysisRecord) {
  if (!prev) return "첫 기록";
  const c = rank(current.grade, current.level);
  const p = rank(prev.grade, prev.level);
  if (c > p) return "▲ 상승";
  if (c < p) return "▼ 하락";
  return "= 유지";
}
