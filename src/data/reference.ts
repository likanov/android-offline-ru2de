import type { RuleTopic } from '../features/assistant/assistantTypes';
// Authored lesson summaries, checked against Goethe-Institut A1 tables and Duden.
// Sources are documentation only: the installed application never fetches them.
export const reference: Record<RuleTopic, {
    title: string;
    text: string;
}> = {
    gender: {
        title: 'Встроенный справочник: род (урок 1; Duden)',
        text: 'В немецком три грамматических рода: мужской — der, женский — die, средний — das. Существительные пишутся с заглавной буквы и учатся вместе с артиклем: der Stuhl — стул, die Sonne — солнце, das Mädchen — девочка. Немецкий род может отличаться от русского и от пола человека: Mädchen имеет средний род. Род целевого слова берётся из его карточки. Прилагательные сами по себе не имеют постоянного рода существительного. Этот фрагмент не объясняет склонение прилагательных и другие падежи.',
    },
    articles: {
        title: 'Встроенный справочник: артикли (урок 1; Goethe-Institut A1)',
        text: 'В именительном падеже единственного числа определённые артикли: мужской der, женский die, средний das. Неопределённые: мужской ein, женский eine, средний ein. Определённый артикль обозначает известный или уже упомянутый предмет; неопределённый вводит один предмет. Примеры: Das ist ein Stuhl. Der Stuhl ist neu. — Это стул. Стул новый. Das ist eine Lampe. — Это лампа. Das ist ein Buch. — Это книга. Во множественном числе определённый артикль — die: Die Bücher sind neu. — Книги новые. У ein/eine нет формы множественного числа. Этот фрагмент не объясняет другие падежи.',
    },
};
