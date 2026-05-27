import { domainEvents, type BookChangedField, type DomainEventMap } from "@/domain/events";

export type ServerEventScope = { kind: "library" } | { kind: "user"; userId: number };

export type ServerEventEnvelope<E extends keyof DomainEventMap = keyof DomainEventMap> = {
  eventId: number;
  publishedAt: string;
  scope: ServerEventScope;
  event: { type: E; payload: DomainEventMap[E] };
  originClientId?: string;
};

type BookBooleanPayloadField = "isRead" | "isHidden";
type RenamedPayloadIdField = "authorId" | "seriesId" | "tagId";
type CursorCriticalHandler<E extends keyof DomainEventMap> = (payload: DomainEventMap[E]) => Promise<void>;
type CursorCriticalRegistration<E extends keyof DomainEventMap> = { handler: CursorCriticalHandler<E> };

const KNOWN_EVENTS = [
  "bookUpdated",
  "bookCreated",
  "bookDeleted",
  "bookRatingChanged",
  "bookReadChanged",
  "bookHiddenChanged",
  "authorRenamed",
  "authorMerged",
  "authorDeleted",
  "seriesRenamed",
  "seriesMerged",
  "seriesDeleted",
  "tagRenamed",
  "tagMerged",
  "tagDeleted",
  "shelfCreated",
  "shelfRenamed",
  "shelfDeleted",
  "shelfMembershipChanged",
  "readingProgressChanged",
] as const satisfies readonly (keyof DomainEventMap)[];

const KNOWN_EVENT_SET = new Set<keyof DomainEventMap>(KNOWN_EVENTS);

const USER_SCOPED_EVENTS = new Set<keyof DomainEventMap>([
  "bookRatingChanged",
  "bookReadChanged",
  "bookHiddenChanged",
  "shelfCreated",
  "shelfRenamed",
  "shelfDeleted",
  "shelfMembershipChanged",
  "readingProgressChanged",
]);

const BOOK_CHANGED_FIELDS = new Set<BookChangedField>([
  "title",
  "description",
  "publisher",
  "pubDate",
  "coverPath",
  "authors",
  "series",
  "seriesNumber",
  "tags",
  "language",
  "rating",
  "read",
  "files",
  "identifiers",
]);

const cursorCriticalHandlers: {
  [E in keyof DomainEventMap]?: Array<CursorCriticalRegistration<E>>;
} = {};

export function dispatchServerEvent(raw: unknown): void {
  const envelope = parseServerEvent(raw);
  domainEvents.publish(envelope.event.type, envelope.event.payload);
}

export function registerCursorCriticalServerEventHandler<E extends keyof DomainEventMap>(
  type: E,
  handler: CursorCriticalHandler<E>,
): () => void {
  const registrations = (cursorCriticalHandlers[type] ??= []) as Array<CursorCriticalRegistration<E>>;
  const registration: CursorCriticalRegistration<E> = { handler };
  registrations.push(registration);
  return () => {
    const current = cursorCriticalHandlers[type] as Array<CursorCriticalRegistration<E>> | undefined;
    if (!current) return;
    const index = current.indexOf(registration);
    if (index === -1) return;
    current.splice(index, 1);
    if (current.length === 0) delete cursorCriticalHandlers[type];
  };
}

export async function applyServerEvent(raw: unknown): Promise<ServerEventEnvelope> {
  const envelope = parseServerEvent(raw);
  domainEvents.publish(envelope.event.type, envelope.event.payload);
  await applyCursorCriticalHandlers(envelope.event.type, envelope.event.payload);
  return envelope;
}

async function applyCursorCriticalHandlers<E extends keyof DomainEventMap>(
  type: E,
  payload: DomainEventMap[E],
): Promise<void> {
  const registrations = cursorCriticalHandlers[type] as Array<CursorCriticalRegistration<E>> | undefined;
  if (!registrations) return;
  const snapshot = [...registrations];
  await Promise.all(snapshot.map(({ handler }) => handler(payload)));
}

function parseServerEvent(raw: unknown): ServerEventEnvelope {
  const envelope = expectRecord(raw, "bad server event");
  if (typeof envelope.eventId !== "number") throw new Error("bad server event id");
  if (typeof envelope.publishedAt !== "string") throw new Error("bad server event publishedAt");

  const scope = parseScope(envelope.scope);
  const event = expectRecord(envelope.event, "bad server event payload");
  if (typeof event.type !== "string" || !KNOWN_EVENT_SET.has(event.type as keyof DomainEventMap)) {
    throw new Error(`unknown server event: ${String(event.type)}`);
  }

  const type = event.type as keyof DomainEventMap;
  validateEventScope(type, scope);
  validatePayload(type, event.payload);

  return {
    ...envelope,
    scope,
    event: { type, payload: event.payload as DomainEventMap[typeof type] },
  } as ServerEventEnvelope;
}

function parseScope(raw: unknown): ServerEventScope {
  const scope = expectRecord(raw, "bad server event scope");
  if (scope.kind === "library") return { kind: "library" };
  if (scope.kind === "user" && typeof scope.userId === "number") {
    return { kind: "user", userId: scope.userId };
  }
  throw new Error("bad server event scope");
}

function validateEventScope(type: keyof DomainEventMap, scope: ServerEventScope): void {
  const userScoped = USER_SCOPED_EVENTS.has(type);
  if (userScoped && scope.kind !== "user") throw new Error("bad server event scope");
  if (!userScoped && scope.kind !== "library") throw new Error("bad server event scope");
}

function validatePayload(type: keyof DomainEventMap, payload: unknown): void {
  const value = expectRecord(payload, "bad server event payload");

  switch (type) {
    case "bookUpdated":
      validateBookUpdatedPayload(value);
      return;
    case "bookCreated":
      validateBookCreatedPayload(value);
      return;
    case "bookDeleted":
      requireNumber(value.bookId);
      return;
    case "bookRatingChanged":
      validateBookRatingPayload(value);
      return;
    case "bookReadChanged":
      validateBookBooleanPayload(value, "isRead");
      return;
    case "bookHiddenChanged":
      validateBookBooleanPayload(value, "isHidden");
      return;
    case "authorRenamed":
      validateRenamedPayload(value, "authorId");
      return;
    case "authorDeleted":
      requireNumber(value.authorId);
      return;
    case "seriesRenamed":
      validateRenamedPayload(value, "seriesId");
      return;
    case "seriesDeleted":
      requireNumber(value.seriesId);
      return;
    case "tagRenamed":
      validateRenamedPayload(value, "tagId");
      return;
    case "tagDeleted":
      requireNumber(value.tagId);
      return;
    case "authorMerged":
    case "seriesMerged":
    case "tagMerged":
      validateMergedPayload(value);
      return;
    case "shelfCreated":
    case "shelfRenamed":
      validateShelfNamedPayload(value);
      return;
    case "shelfDeleted":
      requireNumber(value.shelfId);
      return;
    case "shelfMembershipChanged":
      requireNumber(value.shelfId);
      requireNumber(value.bookId);
      requireBoolean(value.hasBook);
      return;
    case "readingProgressChanged":
      requireNumber(value.bookId);
      requireBoolean(value.hadPosition);
      requireBoolean(value.hasPosition);
      requireBoolean(value.lastReadAtChanged);
      return;
  }
}

function validateBookUpdatedPayload(value: Record<string, unknown>): void {
  requireBookPayload(value.book);
  if (value.detail !== undefined) throw new Error("bad server event payload");
  requireChangedFields(value.changedFields);
  if (value.affected !== undefined) validateAffected(value.affected);
}

function requireChangedFields(value: unknown): void {
  if (!Array.isArray(value) || !value.every(isBookChangedField)) {
    throw new Error("bad server event payload");
  }
  if (value.some(isUserScopedBookField)) {
    throw new Error("bad server event payload");
  }
}

function isUserScopedBookField(field: BookChangedField): boolean {
  return field === "rating" || field === "read";
}

function validateBookCreatedPayload(value: Record<string, unknown>): void {
  requireNumber(value.bookId);
  if (value.book !== undefined) requireBookPayload(value.book);
}

function validateBookRatingPayload(value: Record<string, unknown>): void {
  requireNumber(value.bookId);
  if (typeof value.rating !== "number" && value.rating !== null) throw new Error("bad server event payload");
}

function validateBookBooleanPayload(value: Record<string, unknown>, field: BookBooleanPayloadField): void {
  requireNumber(value.bookId);
  requireBoolean(value[field]);
}

function validateRenamedPayload(value: Record<string, unknown>, idField: RenamedPayloadIdField): void {
  requireNumber(value[idField]);
  requireString(value.name);
  if (value.sortName !== undefined) requireString(value.sortName);
}

function validateMergedPayload(value: Record<string, unknown>): void {
  requireNumber(value.targetId);
  requireNumber(value.sourceId);
}

function validateShelfNamedPayload(value: Record<string, unknown>): void {
  requireNumber(value.shelfId);
  requireString(value.name);
}

function requireBookPayload(raw: unknown): void {
  const book = expectRecord(raw, "bad server event payload");
  requireNumber(book.id);
}

function validateAffected(raw: unknown): void {
  const affected = expectRecord(raw, "bad server event payload");
  if (affected.authorIds !== undefined && !isNumberArray(affected.authorIds)) throw new Error("bad server event payload");
  if (affected.seriesId !== undefined && !(typeof affected.seriesId === "number" || affected.seriesId === null)) {
    throw new Error("bad server event payload");
  }
  if (affected.seriesIds !== undefined && !isNullableNumberArray(affected.seriesIds)) throw new Error("bad server event payload");
  if (affected.tagIds !== undefined && !isNumberArray(affected.tagIds)) throw new Error("bad server event payload");
  if (affected.language !== undefined && !(typeof affected.language === "string" || affected.language === null)) {
    throw new Error("bad server event payload");
  }
  if (affected.languages !== undefined && !isNullableStringArray(affected.languages)) throw new Error("bad server event payload");
}

function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function isBookChangedField(value: unknown): value is BookChangedField {
  return typeof value === "string" && BOOK_CHANGED_FIELDS.has(value as BookChangedField);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isNullableNumberArray(value: unknown): value is Array<number | null> {
  return Array.isArray(value) && value.every((item) => typeof item === "number" || item === null);
}

function isNullableStringArray(value: unknown): value is Array<string | null> {
  return Array.isArray(value) && value.every((item) => typeof item === "string" || item === null);
}

function requireNumber(value: unknown): void {
  if (typeof value !== "number") throw new Error("bad server event payload");
}

function requireString(value: unknown): void {
  if (typeof value !== "string") throw new Error("bad server event payload");
}

function requireBoolean(value: unknown): void {
  if (typeof value !== "boolean") throw new Error("bad server event payload");
}
