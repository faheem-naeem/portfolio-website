import { describe, expect, it } from 'vitest';
import { isProfane, validateName } from '../src/lib/name';

describe('validateName', () => {
    it('treats missing or blank names as anonymous', () => {
        expect(validateName(undefined)).toEqual({ ok: true, name: null });
        expect(validateName('   ')).toEqual({ ok: true, name: null });
    });

    it('trims and collapses whitespace', () => {
        expect(validateName('  Ada   L. ')).toEqual({
            ok: true,
            name: 'Ada L.',
        });
    });

    it('accepts exactly 24 characters, including non-Latin letters', () => {
        expect(validateName('a'.repeat(24)).ok).toBe(true);
        expect(validateName('Zoë_Ångström-2026').ok).toBe(true);
    });

    it('rejects names over 24 characters', () => {
        expect(validateName('a'.repeat(25)).ok).toBe(false);
    });

    it('rejects markup and symbols', () => {
        expect(validateName('<script>').ok).toBe(false);
        expect(validateName('a@b.com').ok).toBe(false);
    });

    it('rejects non-string names', () => {
        expect(validateName(42).ok).toBe(false);
    });
});

describe('isProfane', () => {
    it('catches obvious words, leetspeak and separators', () => {
        expect(isProfane('fuck')).toBe(true);
        expect(isProfane('ShIt-lord')).toBe(true);
        expect(isProfane('f.u.c.k')).toBe(true);
        expect(isProfane('5h1t')).toBe(true);
        expect(isProfane('big dick')).toBe(true);
    });

    it('does not flag innocent names containing short blocked words', () => {
        expect(isProfane('Charles Dickens')).toBe(false);
        expect(isProfane('Grape Hancock')).toBe(false);
        expect(isProfane('Ada Lovelace')).toBe(false);
    });
});
