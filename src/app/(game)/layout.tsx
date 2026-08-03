// 游戏路由组：无站点外壳，让 Phaser 画布铺满整个视口。
// 根 layout 的 html/body/主题脚本/庆祝层仍在外层生效。

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
