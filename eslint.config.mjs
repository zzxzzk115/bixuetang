import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 浏览器插件是独立的 MV3 工程（纯 JS + chrome API），不走 Next 这套规则
    "extension/**",
    // serve 的运行目录是构建产物的拷贝
    ".runtime/**",
  ]),
]);

export default eslintConfig;
