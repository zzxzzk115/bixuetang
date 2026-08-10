// 五十音图数据(纯常量,客户端可直接 import)。清音 46 音,平假名/片假名 + 罗马音。
// 表按行组织,每行 5 列(あ/い/う/え/お 段);缺口用 null 占位(や行/わ行/ん)。

export interface Kana {
  hira: string;
  kata: string;
  romaji: string;
}

export interface KanaRow {
  /** 行键(あ行=a、か行=k…),仅用于 React key */
  key: string;
  /** 行标签 */
  label: string;
  /** 5 列,缺口为 null */
  cells: (Kana | null)[];
}

const k = (hira: string, kata: string, romaji: string): Kana => ({
  hira,
  kata,
  romaji,
});

export const KANA_ROWS: KanaRow[] = [
  {
    key: "a",
    label: "あ行",
    cells: [k("あ", "ア", "a"), k("い", "イ", "i"), k("う", "ウ", "u"), k("え", "エ", "e"), k("お", "オ", "o")],
  },
  {
    key: "ka",
    label: "か行",
    cells: [k("か", "カ", "ka"), k("き", "キ", "ki"), k("く", "ク", "ku"), k("け", "ケ", "ke"), k("こ", "コ", "ko")],
  },
  {
    key: "sa",
    label: "さ行",
    cells: [k("さ", "サ", "sa"), k("し", "シ", "shi"), k("す", "ス", "su"), k("せ", "セ", "se"), k("そ", "ソ", "so")],
  },
  {
    key: "ta",
    label: "た行",
    cells: [k("た", "タ", "ta"), k("ち", "チ", "chi"), k("つ", "ツ", "tsu"), k("て", "テ", "te"), k("と", "ト", "to")],
  },
  {
    key: "na",
    label: "な行",
    cells: [k("な", "ナ", "na"), k("に", "ニ", "ni"), k("ぬ", "ヌ", "nu"), k("ね", "ネ", "ne"), k("の", "ノ", "no")],
  },
  {
    key: "ha",
    label: "は行",
    cells: [k("は", "ハ", "ha"), k("ひ", "ヒ", "hi"), k("ふ", "フ", "fu"), k("へ", "ヘ", "he"), k("ほ", "ホ", "ho")],
  },
  {
    key: "ma",
    label: "ま行",
    cells: [k("ま", "マ", "ma"), k("み", "ミ", "mi"), k("む", "ム", "mu"), k("め", "メ", "me"), k("も", "モ", "mo")],
  },
  {
    key: "ya",
    label: "や行",
    cells: [k("や", "ヤ", "ya"), null, k("ゆ", "ユ", "yu"), null, k("よ", "ヨ", "yo")],
  },
  {
    key: "ra",
    label: "ら行",
    cells: [k("ら", "ラ", "ra"), k("り", "リ", "ri"), k("る", "ル", "ru"), k("れ", "レ", "re"), k("ろ", "ロ", "ro")],
  },
  {
    key: "wa",
    label: "わ行",
    cells: [k("わ", "ワ", "wa"), null, null, null, k("を", "ヲ", "wo")],
  },
  {
    key: "n",
    label: "ん",
    cells: [k("ん", "ン", "n"), null, null, null, null],
  },
];

/** 扁平化的全部 46 音(供测验随机抽题) */
export const ALL_KANA: Kana[] = KANA_ROWS.flatMap((r) =>
  r.cells.filter((c): c is Kana => c !== null),
);

export type KanaScript = "hira" | "kata";

export const SCRIPT_LABEL: Record<KanaScript, string> = {
  hira: "平假名",
  kata: "片假名",
};

/** 测验通过所需连续答对题数 */
export const KANA_QUIZ_LEN = 10;
