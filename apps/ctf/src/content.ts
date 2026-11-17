// Puzzle copy: step titles and one hint per step. Hints nudge, they never
// give the answer away. (Kept here, not in @faheem/data: it is puzzle text,
// not a personal fact.)

export interface Step {
    title: string;
    teaser: string;
    hint: string;
}

export const STEPS: Step[] = [
    {
        title: 'Look closer',
        teaser: 'It starts on faheemnaeem.dev.',
        hint: 'Developers leave notes for developers. Open your browser developer tools on faheemnaeem.dev and look around.',
    },
    {
        title: 'Where robots may not go',
        teaser: 'Every site tells crawlers what to skip.',
        hint: 'robots.txt lists paths crawlers should not visit. You are not a crawler.',
    },
    {
        title: 'Decode the note',
        teaser: 'The note is not written for human eyes.',
        hint: 'Upper and lower case letters, digits, + and /: a classic 6-bit encoding. Try base64 --decode.',
    },
    {
        title: 'Ask the internet phone book',
        teaser: 'Some clues live outside any web page.',
        hint: 'The answer looks like gibberish. Rotate every letter halfway around the alphabet (13 places).',
    },
    {
        title: 'Knock with curiosity',
        teaser: 'Some doors only open if you ask the right way.',
        hint: 'A plain browser visit is not enough. Send the request with the header it asks for, for example with curl -H.',
    },
];
