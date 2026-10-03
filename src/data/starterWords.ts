export type StarterWord = {
  plural?: string | null;
  exampleDe?: string | null;
  exampleRu?: string | null;
  note?: string;
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
// Plurals checked against Duden entries (2026-10-03); examples are original.
const details: Record<string,[string,string,string,string?]> = {
 Tisch:['Tische','Der Tisch ist groß.','Стол большой.'],
 Stuhl:['Stühle','Der Stuhl ist bequem.','Стул удобный.'],
 Schrank:['Schränke','Der Schrank ist neu.','Шкаф новый.'],
 Stift:['Stifte','Ich schreibe mit einem Stift.','Я пишу письменной принадлежностью.','Stift — общее название письменной принадлежности; карандаш точнее Bleistift. Исходный перевод урока сохранён.'],
 Computer:['Computer','Der Computer ist neu.','Компьютер новый.'],
 Zug:['Züge','Der Zug kommt.','Поезд прибывает.','Здесь Zug означает поезд; у слова есть и другие значения.'],
 Mensch:['Menschen','Jeder Mensch ist anders.','Каждый человек разный.'],
 Lehrer:['Lehrer','Der Lehrer erklärt das Wort.','Учитель объясняет слово.'],
 Lampe:['Lampen','Die Lampe ist an.','Лампа включена.'],
 Tasche:['Taschen','Die Tasche ist klein.','Сумка маленькая.'],
 Blume:['Blumen','Die Blume ist schön.','Цветок красивый.'],
 Vase:['Vasen','Die Vase steht auf dem Tisch.','Ваза стоит на столе.'],
 Straße:['Straßen','Die Straße ist breit.','Улица широкая.'],
 Übung:['Übungen','Die Übung ist leicht.','Упражнение лёгкое.'],
 Zeitung:['Zeitungen','Ich lese eine Zeitung.','Я читаю газету.'],
 Zeitschrift:['Zeitschriften','Die Zeitschrift ist interessant.','Журнал интересный.'],
 Buch:['Bücher','Das Buch ist interessant.','Книга интересная.'],
 Bild:['Bilder','Das Bild ist schön.','Картина красивая.','Bild также означает изображение или фотографию.'],
 Wort:['Wörter','Ich lerne ein neues Wort.','Я учу новое слово.','Wörter — отдельные слова; Worte — связное высказывание, чьи-либо слова.'],
 Haus:['Häuser','Das Haus ist alt.','Дом старый.'],
 Zimmer:['Zimmer','Das Zimmer ist groß.','Комната большая.'],
 Kind:['Kinder','Das Kind spielt.','Ребёнок играет.'],
 Mädchen:['Mädchen','Das Mädchen liest.','Девочка читает.','Грамматический род средний из-за суффикса -chen.'],
 Spielzeug:['Spielzeuge','Das Spielzeug ist neu.','Игрушка новая.','Spielzeuge — отдельные игрушки; собирательное Spielzeug обычно без множественного числа.'],
};
const adjectiveExamples: Record<string,[string,string]> = {
 groß:['Das Haus ist groß.','Дом большой.'],
 klein:['Das Zimmer ist klein.','Комната маленькая.'],
 neu:['Das Buch ist neu.','Книга новая.'],
 alt:['Der Tisch ist alt.','Стол старый.'],
 gut:['Das Buch ist gut.','Книга хорошая.'],
 schlecht:['Das Wetter ist schlecht.','Погода плохая.'],
 schön:['Die Blume ist schön.','Цветок красивый.'],
 interessant:['Die Zeitung ist interessant.','Газета интересная.'],
 weiß:['Das Haus ist weiß.','Дом белый.'],
 schwarz:['Der Stift ist schwarz.','Карандаш чёрный.'],
 rot:['Die Blume ist rot.','Цветок красный.'],
 blau:['Die Tasche ist blau.','Сумка синяя.'],
 grün:['Das Spielzeug ist grün.','Игрушка зелёная.'],
 grau:['Der Schrank ist grau.','Шкаф серый.'],
 braun:['Der Stuhl ist braun.','Стул коричневый.'],
 gelb:['Die Vase ist gelb.','Ваза жёлтая.'],
};
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
  plural: details[word.de]?.[0] ?? null,
  exampleDe: details[word.de]?.[1] ?? adjectiveExamples[word.de]?.[0] ?? null,
  exampleRu: details[word.de]?.[2] ?? adjectiveExamples[word.de]?.[1] ?? null,
  note: details[word.de]?.[3] ?? "",
}));

export const starterTopics: readonly { name: string; words: readonly string[] }[] = [
 {name:'Предметы и комната',words:['Tisch','Stuhl','Schrank','Stift','Computer','Lampe','Tasche','Blume','Vase','Buch','Bild','Haus','Zimmer','Spielzeug']},
 {name:'Люди',words:['Mensch','Lehrer','Kind','Mädchen']},
 {name:'Транспорт',words:['Zug','Straße']},
 {name:'Учёба и печать',words:['Stift','Computer','Buch','Wort','Übung','Zeitung','Zeitschrift']},
 {name:'Признаки',words:['groß','klein','neu','alt','gut','schlecht','schön','interessant']},
 {name:'Цвета',words:['weiß','schwarz','rot','blau','grün','grau','braun','gelb']},
];
