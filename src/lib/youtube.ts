import {
  CLUB_LABEL,
  type ClubType,
  type Grade,
  type SwingFocus,
  type SwingPoint,
  type VideoRecommendation,
} from "./types";

export type { VideoRecommendation } from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3/search";

/**
 * 한국어 골프 콘텐츠 채널 이름 화이트리스트.
 * 검색 결과에서 채널 제목에 다음 키워드를 포함하는 결과를 최우선 표시.
 * 정확한 채널 ID를 알면 env `YOUTUBE_WHITELIST_CHANNEL_IDS`에 쉼표로 추가 가능.
 */
const CHANNEL_NAME_WHITELIST = [
  "SBS골프",
  "JTBC골프",
  "MBN골프",
  "골프존",
  "한국프로골프",
  "KPGA",
  "골프채널",
  "GolfTV",
];

interface RawSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

interface RawSearchResponse {
  items?: RawSearchItem[];
  error?: { message?: string };
}

function envWhitelistChannelIds(): Set<string> {
  const raw = process.env.YOUTUBE_WHITELIST_CHANNEL_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function isWhitelistedChannel(channelId: string, channelTitle: string): boolean {
  if (envWhitelistChannelIds().has(channelId)) return true;
  const t = channelTitle.toLowerCase();
  return CHANNEL_NAME_WHITELIST.some((name) =>
    t.includes(name.toLowerCase()),
  );
}

async function searchYouTube(
  query: string,
  apiKey: string,
  maxResults = 12,
): Promise<RawSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(maxResults),
    order: "relevance",
    regionCode: "KR",
    relevanceLanguage: "ko",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    q: query,
    key: apiKey,
  });
  const res = await fetch(`${API_BASE}?${params}`, { cache: "no-store" });
  const data = (await res.json()) as RawSearchResponse;
  if (!res.ok) {
    throw new Error(
      `YouTube API ${res.status}: ${data?.error?.message ?? "unknown"}`,
    );
  }
  return data.items ?? [];
}

export interface RecommendationContext {
  clubType: ClubType;
  grade: Grade;
  topFocus: SwingFocus;
  weaknesses: SwingPoint[];
}

/** 분석 결과 → 한국어 YouTube 검색어 1~3개 생성 */
function buildQueries(ctx: RecommendationContext): string[] {
  const club = CLUB_LABEL[ctx.clubType];
  const tone =
    ctx.grade === "beginner"
      ? "초보 교정"
      : ctx.grade === "amateur"
        ? "교정 드릴"
        : ctx.grade === "semipro"
          ? "디테일"
          : "프로 드릴";

  const seen = new Set<string>();
  const queries: string[] = [];
  const add = (q: string) => {
    const trimmed = q.trim().replace(/\s+/g, " ");
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      queries.push(trimmed);
    }
  };

  if (ctx.topFocus.title) {
    add(`골프 ${club} ${ctx.topFocus.title} ${tone}`);
  }
  const keyWeakness = ctx.weaknesses.find((w) => w.emphasis === "key");
  if (keyWeakness && keyWeakness.title) {
    add(`골프 ${club} ${keyWeakness.title} ${tone}`);
  }
  // 백업: 클럽 + 등급별 일반 드릴
  if (queries.length === 0) {
    add(`골프 ${club} ${tone}`);
  }
  return queries.slice(0, 2);
}

/**
 * YouTube에서 추천 영상을 검색해 화이트리스트 채널 우선으로 정렬해 반환한다.
 * API 키 없거나 오류 발생 시 빈 배열로 폴백.
 */
export async function findRecommendations(
  ctx: RecommendationContext,
): Promise<VideoRecommendation[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const queries = buildQueries(ctx);
  const seenVideoIds = new Set<string>();
  const collected: VideoRecommendation[] = [];

  for (const query of queries) {
    try {
      const raw = await searchYouTube(query, apiKey, 12);
      for (const item of raw) {
        const vid = item.id?.videoId;
        if (!vid || seenVideoIds.has(vid)) continue;
        seenVideoIds.add(vid);
        const snippet = item.snippet;
        const thumb =
          snippet.thumbnails.medium?.url ??
          snippet.thumbnails.high?.url ??
          snippet.thumbnails.default?.url ??
          "";
        collected.push({
          videoId: vid,
          title: snippet.title,
          channelTitle: snippet.channelTitle,
          channelId: snippet.channelId,
          thumbnailUrl: thumb,
          publishedAt: snippet.publishedAt,
          url: `https://www.youtube.com/watch?v=${vid}`,
          isWhitelisted: isWhitelistedChannel(snippet.channelId, snippet.channelTitle),
          matchedQuery: query,
        });
      }
    } catch (e) {
      console.warn(`YouTube 검색 실패 (${query}):`, e);
    }
  }

  // 화이트리스트 채널 결과를 위로
  collected.sort((a, b) => {
    if (a.isWhitelisted && !b.isWhitelisted) return -1;
    if (!a.isWhitelisted && b.isWhitelisted) return 1;
    return 0;
  });

  return collected.slice(0, 6);
}
