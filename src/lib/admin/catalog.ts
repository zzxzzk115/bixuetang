import "server-only";
import { getContent } from "../content/load";
import { SUBJECTS, SUBJECT_LABEL } from "../content/schema";
import { POTIONS, TIMED_POTIONS } from "../game/boosts";
import { getLootItem, type EncounterType } from "../game/rpg";

// 管理端下拉选项目录:课程、道具。都是静态内容,给详情页操作面板选择用,
// 免得运营手敲 id。纯读、无副作用,不需要鉴权(数据本就公开)。

export interface CatalogEntry {
  id: string;
  label: string;
  /** optgroup 分组名(学科 / 药水) */
  group: string;
}

/** 全部课程,按学科分组、组内按标题排序。 */
export function courseCatalog(): CatalogEntry[] {
  const { courses } = getContent();
  return courses
    .map((c) => ({
      id: c.id,
      label: c.title,
      group: SUBJECT_LABEL[c.subject],
    }))
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group, "zh") ||
        a.label.localeCompare(b.label, "zh"),
    );
}

const ENCOUNTERS: EncounterType[] = ["mob", "cache", "elite", "boss"];

/** 全部可发放道具:遗物(各学科×档位,含诅咒版)+ 经验药水。 */
export function itemCatalog(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const subject of SUBJECTS) {
    for (const enc of ENCOUNTERS) {
      for (const cursed of [false, true]) {
        const id = cursed ? `${subject}-${enc}-cursed` : `${subject}-${enc}`;
        const item = getLootItem(id);
        if (item) {
          out.push({
            id,
            label: `${item.title}${cursed ? " (诅咒)" : ""}`,
            group: SUBJECT_LABEL[subject],
          });
        }
      }
    }
  }
  for (const k of ["x15", "x3"] as const) {
    out.push({
      id: `potion-${k}`,
      label: `${POTIONS[k].title} (${POTIONS[k].badge})`,
      group: "药水",
    });
  }
  for (const k of ["t30", "t60"] as const) {
    out.push({
      id: `timed-${k}`,
      label: `${TIMED_POTIONS[k].title} (${TIMED_POTIONS[k].badge})`,
      group: "药水",
    });
  }
  return out;
}
