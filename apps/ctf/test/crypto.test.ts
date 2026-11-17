import { describe, expect, it } from 'vitest';
import { timingSafeEqual, verifyFlag } from '../src/lib/crypto';
import { TEST_FLAG, TEST_HASH } from './helpers';

describe('verifyFlag', () => {
    it('accepts the flag whose SHA-256 matches FLAG_HASH', async () => {
        expect(await verifyFlag(TEST_FLAG, TEST_HASH)).toBe(true);
        expect(
            await verifyFlag(`  ${TEST_FLAG}\n`, TEST_HASH.toUpperCase()),
        ).toBe(true);
    });

    it('rejects other flags', async () => {
        expect(await verifyFlag('FAHEEM{nope}', TEST_HASH)).toBe(false);
        expect(await verifyFlag(TEST_FLAG.toLowerCase(), TEST_HASH)).toBe(
            false,
        );
    });

    it('rejects everything when FLAG_HASH is malformed', async () => {
        expect(await verifyFlag(TEST_FLAG, 'not-a-hash')).toBe(false);
        expect(await verifyFlag(TEST_FLAG, '')).toBe(false);
    });
});

describe('timingSafeEqual', () => {
    it('compares strings', () => {
        expect(timingSafeEqual('abc', 'abc')).toBe(true);
        expect(timingSafeEqual('abc', 'abd')).toBe(false);
        expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    });
});
