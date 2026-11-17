// Display-name validation for the Hall of Fame: optional, max 24 characters,
// letters/digits/space/._- only, and a basic profanity filter. Every entry is
// also moderated by hand (approved = 0 until reviewed), so this filter only
// has to catch the obvious cases.

export const NAME_MAX = 24;

const ALLOWED = /^[\p{L}\p{N} ._-]+$/u;

const LEET: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    $: 's',
    '@': 'a',
    '!': 'i',
};

/** Matched anywhere in the name, even across separators ("f.u.c.k"). */
const BLOCKED_ROOTS = [
    'fuck',
    'shit',
    'cunt',
    'bitch',
    'pussy',
    'asshole',
    'bastard',
    'slut',
    'whore',
    'nigg',
    'fagg',
    'retard',
    'wanker',
    'porn',
    'hitler',
    'nazi',
    'penis',
    'vagina',
    'motherf',
];

/** Short words matched only as whole words, to avoid "Dickens" or "grape". */
const BLOCKED_WORDS = new Set([
    'dick',
    'cock',
    'rape',
    'piss',
    'twat',
    'fag',
    'tits',
    'cum',
    'anal',
    'kkk',
    'sex',
    'admin',
    'faheem',
    'moderator',
]);

function normalize(text: string): string {
    return text
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[0-9$@!]/g, (ch) => LEET[ch] ?? ch);
}

export function isProfane(name: string): boolean {
    const norm = normalize(name);
    const squashed = norm.replace(/[^a-z]/g, '');
    if (BLOCKED_ROOTS.some((root) => squashed.includes(root))) return true;
    return norm
        .split(/[^a-z]+/)
        .filter(Boolean)
        .some((word) => BLOCKED_WORDS.has(word));
}

export type NameResult =
    { ok: true; name: string | null } | { ok: false; message: string };

/** Validates an optional display name. Empty or missing means anonymous. */
export function validateName(raw: unknown): NameResult {
    if (raw === undefined || raw === null) return { ok: true, name: null };
    if (typeof raw !== 'string')
        return { ok: false, message: 'Display name must be text.' };
    const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!name) return { ok: true, name: null };
    if ([...name].length > NAME_MAX)
        return {
            ok: false,
            message: `Display name must be at most ${NAME_MAX} characters.`,
        };
    if (!ALLOWED.test(name))
        return {
            ok: false,
            message:
                'Display name may only use letters, numbers, spaces, dots, dashes and underscores.',
        };
    if (isProfane(name))
        return {
            ok: false,
            message: 'Please choose a different display name.',
        };
    return { ok: true, name };
}
