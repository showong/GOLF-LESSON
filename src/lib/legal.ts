/**
 * 이용약관·개인정보처리방침 공통 정보.
 * TERMS_VERSION을 바꾸면 기존 사용자도 다음 업로드 전에 다시 동의해야 한다.
 * 대괄호 값은 공개 런칭 전에 실제 운영자 정보로 채워야 한다.
 */
export const TERMS_VERSION = "2026-10-04";
export const TERMS_EFFECTIVE_DATE = "2026년 10월 4일";

export const LEGAL_INFO = {
  serviceName: "골프 레슨 튜더",
  operatorName: "[운영자 상호 또는 성명]",
  contactEmail: "[문의 이메일]",
  privacyOfficer: "[개인정보 보호책임자 성명·직책]",
  hostingRegion: "[Railway 배포 리전 소재국]",
};

export const MINIMUM_AGE = 18;

// 보관 기간은 개인정보처리방침 문구와 실제 정리 작업이 항상 같도록 환경변수가 아닌 상수로 둔다.
/** 원본 영상 보관 일수 (업로드 시점 기준) */
export const VIDEO_RETENTION_DAYS = 30;
/** 마지막 이용 후 계정·분석 기록 보관 일수 */
export const INACTIVE_ACCOUNT_RETENTION_DAYS = 365;
/** 요청 제한 기록(IP 해시 포함) 보관 일수 */
export const RATE_LIMIT_RETENTION_DAYS = 2;
