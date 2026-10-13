// Reference-only rules. Diminutives do not add nouns or learning targets.
export const lektion3Reference = {
  'definite-article-nominative': {
    title: 'Определённый артикль в Nominativ',
    text: 'В Nominativ единственного числа определённый артикль зависит от рода: der — мужской, die — женский, das — средний. Во множественном числе для всех родов используется die: der Tisch → die Tische, das Buch → die Bücher, die Zeitung → die Zeitungen. Род и форму множественного числа учите вместе с существительным.',
  },
  'noun-plural': {
    title: 'Модели множественного числа',
    text: 'Распространённые модели plural: -e (Tisch → Tische), -er с умлаутом (Buch → Bücher), -(e)n (Zeitung → Zeitungen, Student → Studenten), -s (Kino → Kinos, Café → Cafés) и формы без изменения. Эти модели не являются универсальным способом получить plural: используйте проверенную форму каждого слова. Wort в значении «отдельное слово языка» имеет plural Wörter; Worte употребляется в другом смысле, например для связанных слов высказывания. Spielzeuge — форма для отдельных игрушек. Сохраняйте умлауты и акцент в Café / Cafés.',
  },
  'plural-invariant': {
    title: 'Неизменяемые формы',
    text: 'Сравнивайте само существительное без артикля: der Lehrer → die Lehrer, das Zimmer → die Zimmer. Смена артикля не меняет форму существительного. Окончания -er, -el, -n встречаются в распространённых моделях без дополнительного окончания, но не гарантируют совпадения singular и plural. Например, der Apfel → die Äpfel: дополнительного окончания нет, однако умлаут меняет слово. В упражнении неизменяемы Lehrer, Computer, Zimmer, Mädchen, Techniker, Sportler, Arbeiter, Designer.',
  },
  'diminutives-chen-lein': {
    title: 'Уменьшительные формы -chen и -lein',
    text: 'Уменьшительные существительные с суффиксами -chen и -lein — среднего рода; в Nominativ plural само существительное остаётся без изменения. Примеры: das Tischchen → die Tischchen, das Blümchen → die Blümchen, das Kindchen → die Kindchen. Умлаут может появляться при образовании уменьшительного слова (Blume → Blümchen), а не при переходе этого слова во множественное число. Это справочный материал без отдельных учебных целей.',
  },
} as const;
