// Build-time timezone helpers (used for the no-JS fallback text).

/** "UTC-07:00" style offset of `timeZone` at `date` (uses a real minus sign). */
export function utcOffset(timeZone: string, date: Date): string {
    const part = new Intl.DateTimeFormat('en', {
        timeZone,
        timeZoneName: 'longOffset',
    })
        .formatToParts(date)
        .find((p) => p.type === 'timeZoneName')?.value;
    // "GMT" alone means +00:00.
    const offset = !part || part === 'GMT' ? '+00:00' : part.replace('GMT', '');
    return `UTC${offset.replace('-', '−')}`;
}

/**
 * Distinct UTC offsets of a zone across the year of `date` (January and July),
 * e.g. ["UTC−07:00", "UTC−06:00"] for a zone with daylight saving time.
 */
export function yearOffsets(timeZone: string, date: Date): string[] {
    const year = date.getUTCFullYear();
    const samples = [
        new Date(Date.UTC(year, 0, 15, 12)),
        new Date(Date.UTC(year, 6, 15, 12)),
    ];
    return [...new Set(samples.map((d) => utcOffset(timeZone, d)))];
}

/** "UTC−07:00; UTC−06:00 in daylight saving time" (or just "UTC+00:00"). */
export function offsetSummary(timeZone: string, date: Date): string {
    const [standard, daylight] = yearOffsets(timeZone, date);
    return daylight
        ? `${standard}; ${daylight} in daylight saving time`
        : (standard ?? 'UTC+00:00');
}

/** Static description, e.g. "America/Edmonton (UTC−07:00; UTC−06:00 in daylight saving time)". */
export function timezoneSummary(timeZone: string, date: Date): string {
    return `${timeZone} (${offsetSummary(timeZone, date)})`;
}

/** Human date for the "Last built" line, e.g. "17 November 2026". */
export function formatBuildDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date);
}
