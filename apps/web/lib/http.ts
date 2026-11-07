import { z } from 'zod';
import { DomainError } from '@epic/core';
import type { UserDoc } from '@epic/db';
import { logger } from '@epic/schemas/logger';
import { currentUser } from './session';

const STATUS: Record<DomainError['code'], number> = {
  not_found: 404,
  conflict: 409,
  invalid: 422,
  forbidden: 403,
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Runs a route body and maps thrown errors to JSON responses. Never leaks stack traces. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError)
      return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof DomainError) {
      return Response.json({ error: err.message, ...err.details }, { status: STATUS[err.code] });
    }
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: err.issues[0]?.message ?? 'Invalid request', issues: err.issues },
        { status: 422 },
      );
    }
    logger.error('unhandled route error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: 'Something went wrong on our side. Try again.' },
      { status: 500 },
    );
  }
}

export async function requireUser(): Promise<UserDoc> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Sign in first.');
  return user;
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const json: unknown = await req.json().catch(() => {
    throw new HttpError(422, 'Request body must be JSON.');
  });
  return schema.parse(json);
}
