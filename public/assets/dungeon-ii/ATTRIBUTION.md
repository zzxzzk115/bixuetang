# Dungeon Tileset II 素材

- `tiles.png` — 16×16 DungeonTileset II 图集（160×256，10×16 格）
- `hero.png` + `hero.json` — 角色 fauna 行走/奔跑动画图集（walk/run × side/down/up）

- 原作者：0x72
- 来源：https://0x72.itch.io/dungeontileset-ii
- 许可：CC0 1.0 Universal（公有领域，可商用、可修改、免署名）
- 取自 ourcade/phaser3-dungeon-crawler-starter（同为 CC0 重打包），2026-08-03

保留此说明以记录来源。CC0 不要求署名。

关键 tile 索引（图集按 `row*10+col` 编号，16×16px）：
- 地板 idx 38；墙顶 idx 2 与 12；墙侧/底 idx 80、81。
（由 dungeon-01.json 的 Ground/Walls 图层反推得出，见 scripts 无——手工分析。）
