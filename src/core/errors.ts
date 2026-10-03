export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class AppError extends Error {
  constructor(
    public readonly code:
      | "STORAGE"
      | "CANCELLED"
      | "MODEL"
      | "BUSY"
      | "VALIDATION",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
