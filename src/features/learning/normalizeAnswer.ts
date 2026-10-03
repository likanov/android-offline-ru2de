export function normalizeAnswer(text: string): string {
  return text.normalize("NFC").toLowerCase().trim().replace(/\s+/gu, " ");
}

export function checkAnswer(answer: string, expected: string[]): boolean {
  const normalized = normalizeAnswer(answer);
  return (
    normalized.length > 0 &&
    expected.some((value) => normalizeAnswer(value) === normalized)
  );
}
