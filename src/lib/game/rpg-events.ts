import type { EpisodeLoot } from "./rpg";

export const RPG_LOOT_EVENT = "guild:rpg-loot";

export function announceRpgLoot(loot: EpisodeLoot) {
  window.dispatchEvent(
    new CustomEvent<EpisodeLoot>(RPG_LOOT_EVENT, { detail: loot }),
  );
}
