import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalList, LegalSection } from "@/components/LegalDocument";
import { LEGAL_INFO, MINIMUM_AGE, VIDEO_RETENTION_DAYS } from "@/lib/legal";

export const metadata: Metadata = { title: `이용약관 · ${LEGAL_INFO.serviceName}` };

export default function TermsPage() {
  return (
    <LegalDocument
      title="이용약관"
      intro={
        <p>
          이 약관은 {LEGAL_INFO.operatorName}(이하 &quot;운영자&quot;)가 제공하는 {LEGAL_INFO.serviceName}
          (이하 &quot;서비스&quot;)의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정합니다.
        </p>
      }
    >
      <LegalSection title="제1조 (서비스 내용)">
        <p>
          서비스는 이용자가 올린 골프 스윙 영상을 인공지능(AI)으로 분석해 등급·단계, 개선 포인트, 연습 과제를
          제공합니다. 분석에는 이용자 브라우저에서 실행되는 관절 추적(MediaPipe)과 Google Gemini API가 사용됩니다.
        </p>
      </LegalSection>

      <LegalSection title="제2조 (이용 자격)">
        <p>
          서비스는 만 {MINIMUM_AGE}세 이상만 이용할 수 있습니다. 만 {MINIMUM_AGE}세 미만으로 확인되면 운영자는
          이용을 제한하고 관련 기록을 삭제할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="제3조 (영상에 대한 권리 보증)">
        <LegalList
          items={[
            "이용자는 본인이 직접 촬영했거나 이용 권리를 가진 영상만 올려야 합니다.",
            "영상에 다른 사람이 나오는 경우, 이용자는 그 사람의 동의를 받아야 합니다.",
            "타인의 권리를 침해한 영상으로 분쟁이 생기면 해당 영상을 올린 이용자가 책임을 집니다.",
          ]}
        />
      </LegalSection>

      <LegalSection title="제4조 (영상 이용 허락의 범위)">
        <LegalList
          items={[
            "영상의 권리는 이용자에게 있습니다.",
            "이용자는 운영자가 해당 이용자에게 분석 결과를 제공하고 성장 기록을 보여주는 데 필요한 범위에서만 영상을 저장·처리하도록 허락합니다.",
            "운영자는 이용자 영상을 공개하거나 판매하지 않으며, AI 모델 학습에 사용하지 않습니다.",
            `원본 영상은 업로드 후 ${VIDEO_RETENTION_DAYS}일이 지나면 자동 삭제되고, 이용자는 언제든 직접 삭제할 수 있습니다.`,
          ]}
        />
      </LegalSection>

      <LegalSection title="제5조 (AI 가상 코치)">
        <p>
          서비스에 등장하는 헤드코치와 등급별 전담 코치는 AI가 생성하는 <strong>가상 캐릭터</strong>입니다. 실존
          인물, 프로 골퍼, 골프 단체와 관련이 없으며 이들의 의견이나 보증을 의미하지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="제6조 (분석 결과의 한계와 안전)">
        <LegalList
          items={[
            "분석 결과는 AI가 영상만 보고 추정한 참고 정보이며, 실제 실력·스코어나 공인 자격을 뜻하지 않습니다.",
            "촬영 각도, 화질, 조명에 따라 결과가 달라지거나 틀릴 수 있습니다.",
            "서비스는 전문 레슨이나 의료적 조언을 대신하지 않습니다. 통증이나 부상 이력이 있다면 연습 전 전문가와 상담하세요.",
            "이용자는 자신의 신체 상태에 맞게 연습해야 하며, 무리한 동작으로 인한 부상에 대해 운영자는 고의 또는 중대한 과실이 없는 한 책임지지 않습니다.",
          ]}
        />
      </LegalSection>

      <LegalSection title="제7조 (금지 행위)">
        <LegalList
          items={[
            "타인의 영상을 무단으로 올리는 행위",
            "음란·폭력적이거나 골프 스윙과 무관한 영상을 올리는 행위",
            "자동화 도구로 대량 요청을 보내거나 이용 횟수 제한을 우회하는 행위",
            "서비스의 보안을 해치거나 정상 운영을 방해하는 행위",
          ]}
        />
        <p>운영자는 금지 행위가 확인되면 사전 통지 없이 이용을 제한할 수 있습니다.</p>
      </LegalSection>

      <LegalSection title="제8조 (이용 횟수 제한)">
        <p>
          안정적인 운영을 위해 이용자·접속 환경별, 그리고 서비스 전체에 하루 분석 횟수 제한이 있습니다. 제한에
          도달하면 일정 시간 뒤 다시 이용할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="제9조 (서비스 변경과 중단)">
        <p>
          운영자는 기술적·운영상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 중요한 변경은
          서비스 화면에 미리 알립니다. 외부 AI 서비스의 장애로 분석이 지연되거나 실패할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="제10조 (기록 삭제와 이용 종료)">
        <p>
          이용자는 기록 화면의 &quot;내 기록 전체 삭제&quot;로 언제든 영상·분석 기록·계정 정보를 삭제하고 이용을
          종료할 수 있습니다. 자세한 내용은{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            개인정보처리방침
          </Link>
          을 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="제11조 (책임의 제한)">
        <p>
          운영자는 천재지변, 외부 서비스 장애, 이용자의 귀책 사유로 생긴 손해에 대해 책임지지 않습니다. 다만 운영자의
          고의 또는 중대한 과실로 인한 손해는 그러하지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="제12조 (약관의 변경)">
        <p>
          운영자는 관련 법령을 위반하지 않는 범위에서 약관을 바꿀 수 있으며, 변경 내용과 시행일을 시행 7일 전(이용자에게
          불리한 변경은 30일 전)부터 서비스에 알립니다. 변경 후 영상을 올리려면 바뀐 약관에 다시 동의해야 합니다.
        </p>
      </LegalSection>

      <LegalSection title="제13조 (준거법과 관할)">
        <p>이 약관은 대한민국 법을 따르며, 분쟁은 민사소송법상 관할 법원에서 해결합니다.</p>
      </LegalSection>

      <LegalSection title="문의">
        <p>
          {LEGAL_INFO.operatorName} · {LEGAL_INFO.contactEmail}
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
