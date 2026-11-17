import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from '@hono/zod-openapi';

/** Every error response uses this shape: {"error":{"code","message"}}. */
export const ErrorSchema = z
    .object({
        error: z.object({
            code: z.string().openapi({ example: 'NOT_FOUND' }),
            message: z.string().openapi({ example: 'Resource not found' }),
            details: z
                .array(
                    z.object({
                        path: z.string(),
                        message: z.string(),
                    }),
                )
                .optional(),
        }),
    })
    .openapi('Error');

export type ErrorDetail = { path: string; message: string };

export type ErrorBody = {
    error: { code: string; message: string; details?: ErrorDetail[] };
};

export function errorBody(
    code: string,
    message: string,
    details?: ErrorDetail[],
): ErrorBody {
    return { error: details ? { code, message, details } : { code, message } };
}

export function jsonError<S extends ContentfulStatusCode>(
    c: Context,
    status: S,
    code: string,
    message: string,
    details?: ErrorDetail[],
) {
    return c.json(errorBody(code, message, details), status);
}

/** Maps an HTTP status to a stable machine-readable code. */
export function codeForStatus(status: number): string {
    switch (status) {
        case 400:
            return 'BAD_REQUEST';
        case 403:
            return 'FORBIDDEN';
        case 404:
            return 'NOT_FOUND';
        case 405:
            return 'METHOD_NOT_ALLOWED';
        case 413:
            return 'PAYLOAD_TOO_LARGE';
        case 415:
            return 'UNSUPPORTED_MEDIA_TYPE';
        case 429:
            return 'RATE_LIMITED';
        default:
            return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }
}

/** Standard error responses for OpenAPI route definitions. */
export function errorResponse(description: string) {
    return {
        description,
        content: { 'application/json': { schema: ErrorSchema } },
    };
}
