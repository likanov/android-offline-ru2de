export const wordParts = [
  { value: "noun", labelRu: "Существительное" },
  { value: "adjective", labelRu: "Прилагательное" },
  { value: "number", labelRu: "Числительное" },
  { value: "verb", labelRu: "Глагол" },
  { value: "pronoun", labelRu: "Местоимение" },
  { value: "adverb", labelRu: "Наречие" },
  { value: "preposition", labelRu: "Предлог" },
  { value: "conjunction", labelRu: "Союз" },
  { value: "phrase", labelRu: "Выражение" },
] as const;
export type WordPart = (typeof wordParts)[number]["value"];
