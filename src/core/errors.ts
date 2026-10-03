export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class AppError extends Error {
  constructor(
    public readonly code:
      | "STALE_QUESTION"
      | "STORAGE"
      | "CANCELLED"
      | "MODEL"
      | "BUSY"
      | "VALIDATION"
      | "WRONG_PROFILE",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
