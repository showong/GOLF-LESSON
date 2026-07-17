export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL ?? "배포 환경에 등록된 개인정보 문의 이메일";
  const retentionDays = process.env.VIDEO_RETENTION_DAYS ?? "30";

  return (
    <article className="prose prose-slate mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <h1>개인정보처리방침</h1>
      <p>시행일: 2026년 7월 17일 · 버전: 2026-07-17</p>
      <p>
        골프 레슨 튜더는 스윙 분석과 기록 제공에 필요한 최소한의 정보를 처리하며,
        사용자가 선택하지 않은 모델 개선 목적으로 데이터를 사용하지 않습니다.
      </p>

      <h2>처리하는 정보와 목적</h2>
      <ul>
        <li>필수: 임의 사용자 ID, 닉네임 — 기록 구분과 사용자별 접근 통제</li>
        <li>필수: 스윙 영상, 파일 정보, 관절 좌표 — 스윙 구간·자세·등급 분석</li>
        <li>생성 정보: 분석 등급, 점수, 피드백, 숙제 이력 — 결과 제공과 변화 추적</li>
        <li>운영 정보: 요청 시각, 작업 상태, 오류 기록 — 보안·장애 대응</li>
        <li>선택: 코치 수정 결과와 분석 데이터 — 사용자가 별도 동의한 경우 모델 품질 개선</li>
      </ul>

      <h2>외부 서비스와 처리 위탁</h2>
      <ul>
        <li>Railway: 애플리케이션, PostgreSQL, Redis 및 비공개 영상 저장소 운영</li>
        <li>Google Gemini API: 스윙 영상과 추출 프레임을 전송해 AI 분석 수행</li>
        <li>MediaPipe: 관절 분석은 브라우저 기기에서 수행하며 입력 영상을 서버로 추가 전송하지 않음</li>
      </ul>
      <p>
        실제 사용자 영상은 결제가 연결된 Gemini 유료 프로젝트에서만 처리합니다. YouTube 추천은
        파일럿에서 기본 비활성화하며, 활성화 전 별도 정책 고지를 적용합니다.
      </p>

      <h2>보유 및 파기</h2>
      <ul>
        <li>원본 영상: 업로드 후 최대 {retentionDays}일 이내 자동 삭제</li>
        <li>Worker 임시 파일과 Gemini File API 파일: 분석 종료 직후 삭제</li>
        <li>분석 결과와 숙제 이력: 사용자 데이터 삭제 요청 또는 서비스 종료 시까지</li>
        <li>선택적 모델 개선 동의 데이터: 동의 철회 또는 정한 목적 달성 시까지</li>
      </ul>

      <h2>사용자의 권리</h2>
      <p>
        사용자는 <a href="/settings">데이터 관리</a>에서 계정에 연결된 영상과 분석 기록 삭제를
        요청할 수 있습니다. 선택 동의를 거부하거나 철회해도 기본 스윙 분석 이용에는 영향이 없습니다.
      </p>

      <h2>보호 조치와 문의</h2>
      <p>
        사용자 ID 기반 소유권 확인, 서명된 보안 쿠키, 비공개 객체 경로, 직접 업로드,
        요청 속도 제한과 접근 기록을 적용합니다. 개인정보 관련 문의: {contact}
      </p>
      <p className="text-sm text-slate-500">
        사업자 정보와 국외 이전에 관한 최종 고지는 정식 공개 전 대한민국 개인정보 전문가의 검토를 거쳐 확정합니다.
      </p>
    </article>
  );
}

