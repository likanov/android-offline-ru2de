export type Lektion3Kind = 'noun-article' | 'noun-plural' | 'plural-invariant';

export type Lektion3NounId =
  | 'tisch' | 'buch' | 'zeitung' | 'kind' | 'student' | 'bild' | 'mann'
  | 'kino' | 'strasse' | 'hotel' | 'haus' | 'wort' | 'blume' | 'hand'
  | 'stift' | 'computer' | 'lampe' | 'nacht' | 'maedchen' | 'lehrer'
  | 'tasche' | 'stuhl' | 'zug' | 'spielzeug' | 'zeitschrift' | 'zimmer'
  | 'mensch' | 'schrank' | 'techniker' | 'sportler' | 'arbeiter' | 'designer'
  | 'satz' | 'cafe';

// German forms contain the noun only; gender supplies the singular article.
export type Lektion3Noun = {
  id: Lektion3NounId;
  de: string;
  ru: string;
  gender: 'm' | 'f' | 'n';
  plural: string;
  unchanged: boolean;
};
export type Lektion3ArticleItem = {
  id: string;
  sourceExercise: '3.1';
  sourceItem: number;
  nounId: Lektion3NounId;
  number: 'singular' | 'plural';
};
export type Lektion3PluralItem = {
  id: string;
  sourceExercise: '3.2';
  sourceItem: number;
  nounId: Lektion3NounId;
  contextRu: string;
};
export type Lektion3InvariantSourceItem = {
  sourceExercise: '3.3';
  sourceItem: number;
  nounId: Lektion3NounId;
};
export type Lektion3InvariantGroup = {
  id: string;
  nounIds: readonly Lektion3NounId[];
  expectedIds: readonly Lektion3NounId[];
};
export type Lektion3TargetId =
  | `noun-article:${Lektion3NounId}`
  | `noun-plural:${Lektion3NounId}`
  | 'plural-invariant:recognition';
export type Lektion3Target = {
  id: Lektion3TargetId;
  kind: Lektion3Kind;
  pronounId: null;
  labelRu: string;
  catalogVersion: 3;
};
