import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // URL/File 상태를 외부 브라우저 API와 동기화하는 기존 효과 패턴은 의도적이다.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  globalIgnores([".next/**", "node_modules/**", "dist/**", ".artifacts/**", "coverage/**"]),
]);
