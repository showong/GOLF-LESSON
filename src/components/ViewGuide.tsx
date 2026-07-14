"use client";

/**
 * 측면샷/정면샷 촬영 각도 샘플 일러스트.
 * 외부 이미지 없이 인라인 SVG — 오프라인·CDN 차단 환경에서도 항상 표시된다.
 * 업로드 슬롯의 빈 상태(영상 미선택)에서 "이 각도로 찍으세요"를 보여주는 용도.
 *
 * 스타일: 곡선 기반의 둥근 실루엣, 저명도 팔레트(emerald-400/amber-500),
 * 타깃 방향은 지면 화살표 대신 볼 비행 궤적(점선 아크)으로 표현.
 */
import type { VideoView } from "@/lib/types";

const STROKE = "#34d399"; // emerald-400 — 저명도, 어두운 배경 위 은은하게
const ACCENT = "#f59e0b"; // amber-500 — 카메라/타깃 표시
const BALL = "#e2e8f0"; // slate-200

function CameraGlyph({ x, y, angle = 0 }: { x: number; y: number; angle?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} opacity={0.9}>
      <rect x={-6} y={-4.5} width={12} height={9} rx={2} fill="none" stroke={ACCENT} strokeWidth={1.3} />
      <path d="M 6 -2.5 L 11 -5 L 11 5 L 6 2.5 Z" fill="none" stroke={ACCENT} strokeWidth={1.3} />
    </g>
  );
}

/**
 * 측면샷: 오른손잡이 DTL(다운더라인) 실영상과 좌우 일치 —
 * 카메라(골퍼 뒤) 기준 골퍼는 왼쪽, 클럽은 오른쪽 아래 볼로 뻗고,
 * 볼은 위쪽 스크린 속으로 날아간다. (사용자 실영상 프레임과 대조해 방향 검증)
 */
export function SideViewGuide() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-label="측면샷 촬영 예시">
      {/* 바닥 */}
      <line x1={14} y1={100} x2={186} y2={100} stroke={STROKE} strokeWidth={1} opacity={0.35} />

      {/* 시뮬레이터 스크린 — 볼 위쪽(타깃 라인 정면). 오른손잡이 DTL 구도:
          골퍼 왼쪽 · 클럽이 오른쪽 아래 볼로 · 볼이 스크린 속으로 (실영상 좌우 일치) */}
      <g opacity={0.85}>
        <rect
          x={112}
          y={16}
          width={58}
          height={42}
          rx={3}
          fill="rgba(52,211,153,0.07)"
          stroke={STROKE}
          strokeWidth={1.2}
        />
        <line x1={116} y1={46} x2={166} y2={46} stroke={STROKE} strokeWidth={0.8} opacity={0.5} />
        <line x1={152} y1={46} x2={152} y2={30} stroke={STROKE} strokeWidth={0.8} opacity={0.7} />
        <path d="M 152 30 L 159 33 L 152 36" fill="none" stroke={STROKE} strokeWidth={0.8} opacity={0.7} />
      </g>
      <text x={141} y={11} fontSize={7.5} fill={STROKE} textAnchor="middle" opacity={0.9}>
        스크린(타깃)
      </text>

      {/* 골퍼: 왼쪽에서 오른쪽(볼)을 향해 어드레스 — 곡선 실루엣 */}
      <g
        stroke={STROKE}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.9}
      >
        {/* 머리 */}
        <circle cx={55} cy={38} r={7} />
        {/* 척추 (앞으로 숙임) */}
        <path d="M 57 45 Q 60 54 64 64" />
        {/* 팔 → 손 */}
        <path d="M 59 48 Q 69 54 77 62" />
        {/* 다리 (무릎 굽힘) */}
        <path d="M 64 64 Q 62 82 66 99" />
        <path d="M 64 64 Q 56 81 59 99" />
        {/* 클럽 샤프트 + 헤드 */}
        <path d="M 77 62 L 88 92" strokeWidth={1.8} />
        <path d="M 88 92 Q 90 96 96 95" strokeWidth={2.2} />
      </g>
      {/* 볼 */}
      <circle cx={100} cy={96} r={3} fill={BALL} />

      {/* 볼 비행: 스크린 속으로 */}
      <g stroke={ACCENT} strokeWidth={1.3} fill="none" opacity={0.9}>
        <path d="M 105 92 Q 119 76 131 60" strokeDasharray="4 3" />
        <path d="M 124 61 L 132 58 L 129 66" />
      </g>

      {/* 카메라 위치: 골퍼 뒤쪽(왼쪽), 손 높이 */}
      <CameraGlyph x={26} y={58} angle={0} />
      <line x1={40} y1={58} x2={46} y2={56} stroke={ACCENT} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
      <text x={27} y={76} fontSize={7.5} fill={ACCENT} textAnchor="middle" opacity={0.95}>
        여기서 촬영
      </text>
    </svg>
  );
}

/** 정면샷: 골퍼가 카메라를 마주봄 — 카메라는 가슴 높이, 몸 정면 */
export function FrontViewGuide() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-label="정면샷 촬영 예시">
      {/* 바닥 */}
      <line x1={14} y1={100} x2={186} y2={100} stroke={STROKE} strokeWidth={1} opacity={0.35} />

      {/* 골퍼 (정면, 어드레스) — 곡선 실루엣 */}
      <g
        stroke={STROKE}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.9}
      >
        {/* 머리 */}
        <circle cx={103} cy={34} r={7} />
        {/* 어깨 */}
        <path d="M 91 47 Q 103 44 115 47" />
        {/* 몸통 */}
        <path d="M 93 47 Q 95 56 97 66" />
        <path d="M 113 47 Q 111 56 109 66" />
        {/* 양팔 → 손 (가운데로 모임) */}
        <path d="M 91 48 Q 97 58 102 68" />
        <path d="M 115 48 Q 109 58 104 68" />
        {/* 다리 (어깨보다 넓은 스탠스) */}
        <path d="M 97 66 Q 91 82 89 99" />
        <path d="M 109 66 Q 115 82 117 99" />
        {/* 클럽 샤프트 + 헤드 (앞발 쪽 볼로) */}
        <path d="M 103 69 L 114 94" strokeWidth={1.8} />
        <path d="M 114 94 Q 117 98 122 96" strokeWidth={2.2} />
      </g>
      {/* 눈 (정면임을 표시) */}
      <circle cx={100} cy={33} r={1} fill={STROKE} />
      <circle cx={106} cy={33} r={1} fill={STROKE} />
      {/* 볼 */}
      <circle cx={125} cy={97} r={3} fill={BALL} />

      {/* 카메라 위치: 정면 가슴 높이 */}
      <CameraGlyph x={34} y={62} angle={0} />
      <line x1={48} y1={62} x2={80} y2={58} stroke={ACCENT} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
      <text x={34} y={78} fontSize={7.5} fill={ACCENT} textAnchor="middle" opacity={0.95}>
        여기서 촬영
      </text>
    </svg>
  );
}

export default function ViewGuideIllustration({ view }: { view: VideoView }) {
  return view === "side" ? <SideViewGuide /> : <FrontViewGuide />;
}
