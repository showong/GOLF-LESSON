import Link from "next/link";
import { TERMS_EFFECTIVE_DATE } from "@/lib/legal";

export function LegalDocument({
  title,
  intro,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-fairway-100 bg-white p-5 text-sm leading-relaxed text-fairway-900 shadow-sm sm:p-8">
      <Link href="/" className="text-xs font-semibold text-fairway-700 underline underline-offset-2">
        ← 홈으로
      </Link>
      <h1 className="mt-3 text-xl font-bold sm:text-2xl">{title}</h1>
      <p className="mt-1 text-xs text-fairway-700/70">시행일: {TERMS_EFFECTIVE_DATE}</p>
      <div className="mt-4 text-fairway-900/90">{intro}</div>
      <div className="mt-6 space-y-6">{children}</div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-fairway-900/90">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (head.length > 3) {
    // 열이 많은 표는 휴대폰 폭에서 가로로 잘리지 않도록 행마다 카드로 보여준다.
    return (
      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <dl
            key={rowIndex}
            className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-fairway-100 p-3 text-xs"
          >
            {row.map((cell, cellIndex) => (
              <div key={cellIndex} className="contents">
                <dt className="font-semibold text-fairway-700">{head[cellIndex]}</dt>
                <dd>{cell}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} className="border border-fairway-100 bg-fairway-50 px-2 py-1.5 text-left font-semibold">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="border border-fairway-100 px-2 py-1.5 align-top">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
