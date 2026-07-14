"use client";

/**
 * 측면샷/정면샷 촬영 각도 샘플 일러스트.
 * 외부 이미지 없이 인라인 SVG — 오프라인·CDN 차단 환경에서도 항상 표시된다.
 * 업로드 슬롯의 빈 상태(영상 미선택)에서 "이 각도로 찍으세요"를 보여주는 용도.
 */
import type { VideoView } from "@/lib/types";

const STROKE = "#a7f3d0"; // emerald-200 — 어두운 슬롯 배경 위에서 잘 보임
const ACCENT = "#fbbf24"; // amber-400 — 카메라/화살표 강조

function CameraGlyph({ x, y, angle = 0 }: { x: number; y: number; angle?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-7} y={-5} width={14} height={10} rx={2} fill="none" stroke={ACCENT} strokeWidth={1.5} />
      <path d={`M 7 -3 L 13 -6 L 13 6 L 7 3 Z`} fill="none" stroke={ACCENT} strokeWidth={1.5} />
    </g>
  );
}

/** 측면샷: 골퍼를 옆에서 — 카메라는 골퍼 뒤쪽 손 높이, 타깃(스크린) 방향이 화면 반대편 */
export function SideViewGuide() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-label="측면샷 촬영 예시">
      {/* 바닥 */}
      <line x1={10} y1={104} x2={190} y2={104} stroke={STROKE} strokeWidth={1} opacity={0.4} />

      {/* 골퍼 (옆모습, 어드레스) */}
      <g stroke={STROKE} strokeWidth={2.5} strokeLinecap="round" fill="none">
        {/* 머리 */}
        <circle cx={118} cy={24} r={8.5} />
        {/* 척추 (앞으로 숙임) */}
        <path d="M 115 33 L 107 64" />
        {/* 팔 → 손 */}
        <path d="M 113 40 L 93 60" />
        {/* 다리 (무릎 굽힘) */}
        <path d="M 107 64 L 113 84 L 109 102" />
        <path d="M 107 64 L 120 83 L 116 102" />
        {/* 클럽 샤프트 */}
        <path d="M 93 60 L 72 99" strokeWidth={2} />
      </g>
      {/* 볼 */}
      <circle cx={68} cy={100} r={3.5} fill="#ffffff" />

      {/* 타깃(스크린) 방향 화살표 */}
      <g stroke={ACCENT} strokeWidth={1.5} fill="none">
        <line x1={54} y1={112} x2={20} y2={112} />
        <path d="M 26 108 L 18 112 L 26 116" />
      </g>
      <text x={56} y={115} fontSize={8} fill={ACCENT}>
        타깃(스크린)
      </text>

      {/* 카메라 위치: 골퍼 뒤쪽, 손 높이 */}
      <CameraGlyph x={176} y={58} angle={180} />
      <line x1={160} y1={58} x2={138} y2={56} stroke={ACCENT} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
      <text x={148} y={44} fontSize={8} fill={ACCENT} textAnchor="middle">
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
      <line x1={10} y1={104} x2={190} y2={104} stroke={STROKE} strokeWidth={1} opacity={0.4} />

      {/* 골퍼 (정면, 어드레스) */}
      <g stroke={STROKE} strokeWidth={2.5} strokeLinecap="round" fill="none">
        {/* 머리 (얼굴이 보임) */}
        <circle cx={100} cy={22} r={8.5} />
        {/* 어깨 */}
        <path d="M 86 37 L 114 37" />
        {/* 몸통 */}
        <path d="M 88 37 L 92 62" />
        <path d="M 112 37 L 108 62" />
        {/* 양팔 → 손 (가운데로 모임) */}
        <path d="M 86 38 L 99 63" />
        <path d="M 114 38 L 101 63" />
        {/* 다리 (어깨보다 넓은 스탠스) */}
        <path d="M 92 62 L 83 102" />
        <path d="M 108 62 L 117 102" />
        {/* 클럽 샤프트 (앞발 쪽 볼로) */}
        <path d="M 100 64 L 116 99" strokeWidth={2} />
      </g>
      {/* 눈 (정면임을 표시) */}
      <circle cx={97} cy={21} r={1.2} fill={STROKE} />
      <circle cx={103} cy={21} r={1.2} fill={STROKE} />
      {/* 볼 */}
      <circle cx={119} cy={100} r={3.5} fill="#ffffff" />

      {/* 카메라 위치: 정면 아래쪽 (가슴 높이에서 골퍼를 향함) */}
      <CameraGlyph x={30} y={60} angle={0} />
      <line x1={46} y1={60} x2={78} y2={55} stroke={ACCENT} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
      <text x={30} y={78} fontSize={8} fill={ACCENT} textAnchor="middle">
        여기서 촬영
      </text>
    </svg>
  );
}

export default function ViewGuideIllustration({ view }: { view: VideoView }) {
  return view === "side" ? <SideViewGuide /> : <FrontViewGuide />;
}
