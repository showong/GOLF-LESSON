import type { Metadata } from "next";
import { LegalDocument, LegalList, LegalSection, LegalTable } from "@/components/LegalDocument";
import {
  INACTIVE_ACCOUNT_RETENTION_DAYS,
  LEGAL_INFO,
  MINIMUM_AGE,
  RATE_LIMIT_RETENTION_DAYS,
  VIDEO_RETENTION_DAYS,
} from "@/lib/legal";

export const metadata: Metadata = { title: `개인정보처리방침 · ${LEGAL_INFO.serviceName}` };

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="개인정보처리방침"
      intro={
        <p>
          {LEGAL_INFO.operatorName}(이하 &quot;운영자&quot;)는 「개인정보 보호법」에 따라 {LEGAL_INFO.serviceName}{" "}
          이용자의 개인정보를 다음과 같이 처리합니다. 서비스는 회원가입 없이 닉네임과 브라우저 쿠키로 이용자를
          구분합니다.
        </p>
      }
    >
      <LegalSection title="1. 처리하는 개인정보 항목">
        <LegalTable
          head={["항목", "수집 방법", "비고"]}
          rows={[
            ["닉네임", "이용자 입력", "기록 화면 표시용"],
            ["스윙 영상", "이용자 업로드", "얼굴·체형이 포함될 수 있음"],
            [
              "관절 위치 좌표",
              "이용자 브라우저에서 추출 후 전송",
              "영상 자체는 이 단계에서 서버로 보내지 않음",
            ],
            ["분석 결과", "서비스가 생성", "등급·점수·코치 메시지 등"],
            ["이용 기록", "자동 생성", "요청 시각, 접속 IP의 해시값(원문 IP 미저장)"],
            ["사용자 식별 쿠키", "자동 생성", "무작위 ID와 위·변조 방지 서명"],
          ]}
        />
      </LegalSection>

      <LegalSection title="2. 처리 목적">
        <LegalList
          items={[
            "스윙 영상 분석과 결과 제공",
            "과거 분석과 비교한 성장 기록·연습 과제 이행 확인",
            "이용 횟수 제한 등 부정 이용 방지와 서비스 안정성 확보",
          ]}
        />
        <p>운영자는 이용자 영상을 AI 모델 학습, 광고, 제3자 판매에 사용하지 않습니다.</p>
      </LegalSection>

      <LegalSection title="3. 보유 기간과 파기">
        <LegalTable
          head={["항목", "보유 기간"]}
          rows={[
            ["원본 스윙 영상", `업로드 후 ${VIDEO_RETENTION_DAYS}일 (이후 자동 삭제)`],
            [
              "닉네임, 분석 결과",
              `이용자가 삭제할 때까지. 단, 마지막 이용 후 ${INACTIVE_ACCOUNT_RETENTION_DAYS}일 동안 이용이 없으면 자동 삭제`,
            ],
            ["이용 기록(IP 해시 포함)", `${RATE_LIMIT_RETENTION_DAYS}일`],
            ["분석 중 생성되는 임시 파일", "분석 종료 즉시 삭제"],
          ]}
        />
        <p>보유 기간이 끝나거나 이용자가 삭제를 요청하면 지체 없이 복구할 수 없는 방법으로 파기합니다.</p>
      </LegalSection>

      <LegalSection title="4. 처리 위탁과 국외 이전">
        <p>운영자는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁하며, 이 과정에서 개인정보가 국외로 이전됩니다.</p>
        <LegalTable
          head={["이전받는 자", "이전 국가", "이전 항목", "목적", "이전 시점·방법", "보유 기간"]}
          rows={[
            [
              "Google LLC (Gemini API)",
              "미국 등 Google 데이터센터 소재국",
              "스윙 영상, 영상에서 추출한 정지 이미지, 관절 좌표 수치",
              "AI 스윙 분석",
              "분석 요청 시 암호화 통신(HTTPS)으로 전송",
              "분석 직후 삭제 요청. 삭제 요청이 실패해도 Google이 최대 48시간 후 자동 삭제",
            ],
            [
              "Railway Corporation",
              LEGAL_INFO.hostingRegion,
              "1번의 전체 항목",
              "서버·데이터베이스·영상 저장소 운영",
              "서비스 이용 시 암호화 통신으로 전송",
              "3번 보유 기간과 같음",
            ],
          ]}
        />
        <p>
          운영자는 결제 계정이 연결된 Gemini API 유료 등급만 사용합니다. 이 등급에서 Google은 입력 영상과 응답을 자사
          제품 개선에 사용하지 않습니다.
        </p>
        <p>
          국외 이전을 원하지 않으면 서비스를 이용하지 않거나 언제든 동의를 철회(기록 삭제)할 수 있습니다. 다만 국외
          이전 없이는 AI 분석을 제공할 수 없습니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 브라우저 내 관절 분석 (MediaPipe)">
        <p>
          관절 추적은 Google의 오픈소스 MediaPipe로 이용자 기기 안에서 실행되며, 이 단계에서 영상은 외부로 전송되지
          않습니다. 다만 분석 모듈과 모델 파일을 jsDelivr와 Google 서버에서 내려받는 과정에서 해당 서버에 접속 정보(IP
          주소 등)가 전달될 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="6. 이용자의 권리와 행사 방법">
        <LegalList
          items={[
            "이용자는 기록 화면에서 자신의 분석 기록을 언제든 볼 수 있습니다.",
            "\"내 기록 전체 삭제\"를 누르면 영상, 분석 기록, 이용 기록, 닉네임이 즉시 삭제되고 식별 쿠키도 지워집니다.",
            `그 밖의 열람·정정·처리정지 요청은 ${LEGAL_INFO.contactEmail}로 보내 주세요. 지체 없이 처리합니다.`,
          ]}
        />
      </LegalSection>

      <LegalSection title="7. 쿠키">
        <p>
          서비스는 같은 이용자의 기록을 이어 보여주기 위해 식별 쿠키(golf_owner)를 1년간 저장합니다. 브라우저 설정에서
          쿠키를 삭제하면 이전 기록과 연결이 끊깁니다. 광고·추적 목적의 쿠키는 사용하지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 만 18세 미만">
        <p>
          서비스는 만 {MINIMUM_AGE}세 미만의 이용을 허용하지 않으며, 미성년자의 개인정보를 고의로 수집하지 않습니다.
          미성년자 정보가 수집된 사실을 알게 되면 즉시 삭제합니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 안전성 확보 조치">
        <LegalList
          items={[
            "영상은 공개 주소가 없는 비공개 저장소에 이용자별로 분리 보관",
            "모든 통신 암호화(HTTPS)와 위·변조 방지 서명 쿠키로 본인 기록만 조회",
            "접속 IP는 원문 대신 복원할 수 없는 해시값으로만 저장",
          ]}
        />
      </LegalSection>

      <LegalSection title="10. 개인정보 보호책임자">
        <p>
          {LEGAL_INFO.privacyOfficer} · {LEGAL_INFO.contactEmail}
        </p>
        <p>
          개인정보 침해 신고·상담은 개인정보침해신고센터(국번 없이 118), 개인정보분쟁조정위원회(1833-6972)에도 할 수
          있습니다.
        </p>
      </LegalSection>

      <LegalSection title="11. 방침의 변경">
        <p>이 방침이 바뀌면 시행 7일 전부터 서비스 화면에 알리며, 중요한 변경은 다시 동의를 받습니다.</p>
      </LegalSection>
    </LegalDocument>
  );
}
