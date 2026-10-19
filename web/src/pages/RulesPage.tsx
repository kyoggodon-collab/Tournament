import { RULE_SECTIONS } from "@shared/sample";

export default function RulesPage() {
  return (
    <main className="page rules">
      <h1>大会ルール</h1>
      <p className="lede">
        令和8年研究室対抗ソフトボール大会の注意事項です。初心者も多いので、審判の方は必ず目を通してください。
      </p>
      {RULE_SECTIONS.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="hint">上記以外は概ね通常のソフトボールのルールとスポーツマンシップに則ります。</p>
    </main>
  );
}
