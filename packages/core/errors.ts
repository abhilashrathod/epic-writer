export type DomainErrorCode = 'not_found' | 'conflict' | 'invalid' | 'forbidden';

/** Base for errors route handlers map to HTTP statuses (404, 409, 422, 403). */
export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
  /** Optional data for the client, e.g. the server's current text on a save conflict. */
  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class NotFound extends DomainError {
  readonly code = 'not_found';
  override name = 'NotFound';
}

export class Conflict extends DomainError {
  readonly code = 'conflict';
  override name = 'Conflict';
}

export class Invalid extends DomainError {
  readonly code = 'invalid';
  override name = 'Invalid';
}

export class Forbidden extends DomainError {
  readonly code = 'forbidden';
  override name = 'Forbidden';
}
