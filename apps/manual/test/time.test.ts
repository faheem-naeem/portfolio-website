import { describe, expect, it } from 'vitest';
import {
    formatBuildDate,
    offsetSummary,
    timezoneSummary,
    utcOffset,
    yearOffsets,
} from '../src/lib/time';

const winter = new Date('2026-01-15T12:00:00Z');

describe('time helpers', () => {
    it('formats UTC offsets with a real minus sign', () => {
        expect(utcOffset('America/Edmonton', winter)).toBe('UTC−07:00');
        expect(utcOffset('Asia/Kolkata', winter)).toBe('UTC+05:30');
        expect(utcOffset('UTC', winter)).toBe('UTC+00:00');
    });

    it('lists standard and daylight offsets', () => {
        expect(yearOffsets('America/Edmonton', winter)).toEqual([
            'UTC−07:00',
            'UTC−06:00',
        ]);
        expect(yearOffsets('UTC', winter)).toEqual(['UTC+00:00']);
    });

    it('summarises a timezone for the no-JS fallback', () => {
        expect(timezoneSummary('America/Edmonton', winter)).toBe(
            'America/Edmonton (UTC−07:00; UTC−06:00 in daylight saving time)',
        );
        expect(offsetSummary('Asia/Tokyo', winter)).toBe('UTC+09:00');
    });

    it('formats the build date', () => {
        expect(formatBuildDate(new Date('2026-11-17T23:30:00Z'))).toBe(
            '17 November 2026',
        );
    });
});
