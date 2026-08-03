import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // src/game/** 是 Phaser 代码，只能被 GameShell 的 useEffect 动态 import。
  // 任何静态 import 会把 phaser 拖进 SSR 包并炸 build——这条规则防回归。
  // 例外：src/game 内部互相 import、GameShell 用的动态 import() 不受影响。
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/game/**", "src/components/game/game-shell.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/game", "@/game/*"],
              message:
                "Phaser 代码只能在 GameShell 里动态 import('@/game')，静态 import 会进 SSR 包。",
            },
          ],
        },
      ],
    },
  },
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
