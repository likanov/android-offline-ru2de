export type StarterWord = {
  seedKey: string;
  seedDe: string;
  de: string;
  ru: string;
  pos: "noun" | "adjective";
  gender: "m" | "f" | "n" | null;
};
const nouns: [string, string, "m" | "f" | "n"][] = [
  ["Tisch", "стол", "m"],
  ["Stuhl", "стул", "m"],
  ["Schrank", "шкаф", "m"],
  ["Stift", "карандаш", "m"],
  ["Computer", "компьютер", "m"],
  ["Zug", "поезд", "m"],
  ["Mensch", "человек", "m"],
  ["Lehrer", "учитель", "m"],
  ["Lampe", "лампа", "f"],
  ["Tasche", "сумка", "f"],
  ["Blume", "цветок", "f"],
  ["Vase", "ваза", "f"],
  ["Straße", "улица", "f"],
  ["Übung", "упражнение", "f"],
  ["Zeitung", "газета", "f"],
  ["Zeitschrift", "журнал", "f"],
  ["Buch", "книга", "n"],
  ["Bild", "картина", "n"],
  ["Wort", "слово", "n"],
  ["Haus", "дом", "n"],
  ["Zimmer", "комната", "n"],
  ["Kind", "ребёнок", "n"],
  ["Mädchen", "девочка", "n"],
  ["Spielzeug", "игрушка", "n"],
];
const adjectives: [string, string][] = [
  ["groß", "большой, высокий"],
  ["klein", "маленький"],
  ["neu", "новый"],
  ["alt", "старый"],
  ["gut", "хороший, добрый"],
  ["schlecht", "плохой"],
  ["schön", "красивый"],
  ["interessant", "интересный"],
  ["weiß", "белый"],
  ["schwarz", "чёрный"],
  ["rot", "красный"],
  ["blau", "голубой, синий"],
  ["grün", "зелёный"],
  ["grau", "серый"],
  ["braun", "коричневый"],
  ["gelb", "жёлтый"],
];
export const starterWords: readonly StarterWord[] = [
  ...nouns.map(([de, ru, gender]) => ({
    de,
    ru,
    gender,
    pos: "noun" as const,
  })),
  ...adjectives.map(([de, ru]) => ({
    de,
    ru,
    gender: null,
    pos: "adjective" as const,
  })),
].map((word, index) => ({
  ...word,
  seedKey: `seed-${String(index + 1).padStart(2, "0")}`,
  seedDe: word.de,
}));
