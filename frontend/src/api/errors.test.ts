import { describe, it, expect } from "vitest";
import {
  ApiError,
  OfflineError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServerError,
  UnknownError,
} from "./errors";

describe("error classes", () => {
  it("ApiError carries status and detail", () => {
    const e = new ApiError(500, "Internal server error");
    expect(e.status).toBe(500);
    expect(e.detail).toBe("Internal server error");
    expect(e.message).toBe("Internal server error");
    expect(e.name).toBe("ApiError");
  });

  it("subclasses inherit from ApiError and keep their own name", () => {
    const e = new NotFoundError(404, "Book not found");
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e.name).toBe("NotFoundError");
  });

  it("OfflineError is a plain Error, not an ApiError", () => {
    const e = new OfflineError();
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(ApiError);
    expect(e.name).toBe("OfflineError");
  });

  it("ValidationError exposes typed fields", () => {
    const fields = [{ type: "missing", loc: ["body", "title"], msg: "Field required" }];
    const e = new ValidationError(fields);
    expect(e.status).toBe(422);
    expect(e.fields).toEqual(fields);
    expect(e).toBeInstanceOf(ApiError);
  });

  it("every subclass distinguishable via instanceof", () => {
    const classes = [
      UnauthenticatedError,
      ForbiddenError,
      NotFoundError,
      ConflictError,
      ServerError,
      UnknownError,
    ] as const;
    for (const Cls of classes) {
      const e = new Cls(0, "x");
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toBeInstanceOf(Cls);
    }
  });
});
