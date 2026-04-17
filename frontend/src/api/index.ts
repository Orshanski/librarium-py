export { client, fetchStatic } from "./client";
export type { ClientOptions } from "./client";

export {
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
export type { PydanticDetailItem } from "./errors";

export type { User, BookListParams } from "./types";
