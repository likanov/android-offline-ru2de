import {
  checkAnswer,
  normalizeAnswer,
} from "../../src/features/learning/normalizeAnswer";

// Catches whitespace, case or canonical Unicode representation changing correctness.
test("normalizes case whitespace and NFC", () => {
  expect(normalizeAnswer("  DER \t STUHL\n ")).toBe("der stuhl");
  expect(normalizeAnswer("GRU\u0308N")).toBe("grün");
  expect(checkAnswer("  DER   STUHL ", ["der Stuhl"])).toBe(true);
  expect(checkAnswer("gru\u0308n", ["grün"])).toBe(true);
});
// Catches transliteration or substring matching admitting incorrect answers.
test.each([
  ["gross", ["groß"]],
  ["grun", ["grün"]],
  ["Stuhl", ["der Stuhl"]],
  ["!gut", ["gut"]],
])("keeps significant characters %s", (answer, expected) => {
  expect(checkAnswer(answer, expected)).toBe(false);
});
test("accepts any explicit alternative", () => {
  expect(checkAnswer("hoch", ["groß", "hoch"])).toBe(true);
});
test("empty answers and empty alternatives cannot be correct", () => {
  expect(checkAnswer(" \t ", [""])).toBe(false);
  expect(checkAnswer("gut", [])).toBe(false);
});
