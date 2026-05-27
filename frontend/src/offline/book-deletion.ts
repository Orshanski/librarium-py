import { domainEvents, type DomainEventMap } from "@/domain/events";
import { removeBookFromLocalStorage } from "@/utils/offline-storage";

type EventBus = typeof domainEvents;
type BookDeletedPayload = DomainEventMap["bookDeleted"];
type BookReadChangedPayload = DomainEventMap["bookReadChanged"];
type DeletedCleanup = (payload: BookDeletedPayload) => Promise<void>;
type ReadCleanup = (payload: BookReadChangedPayload) => Promise<void>;

const inFlightCleanups = new Map<string, Promise<void>>();

function runTrackedCleanup(key: string, cleanupFn: () => Promise<void>): Promise<void> {
  const existing = inFlightCleanups.get(key);
  if (existing) return existing;

  const promise = cleanupFn();
  inFlightCleanups.set(key, promise);
  void promise.then(
    () => {
      if (inFlightCleanups.get(key) === promise) inFlightCleanups.delete(key);
    },
    () => {
      if (inFlightCleanups.get(key) === promise) inFlightCleanups.delete(key);
    },
  );
  return promise;
}

function deletedCleanupKey(bookId: number): string {
  return `bookDeleted:${bookId}`;
}

function readCleanupKey(bookId: number): string {
  return `bookReadChanged:${bookId}`;
}

export async function handleDeletedBookOfflineState(payload: BookDeletedPayload): Promise<void> {
  await removeBookFromLocalStorage(payload.bookId);
}

export async function handleReadBookOfflineState(payload: BookReadChangedPayload): Promise<void> {
  if (payload.isRead !== true) return;
  await removeBookFromLocalStorage(payload.bookId);
}

export function handleDeletedBookOfflineStateForServerEvent(payload: BookDeletedPayload): Promise<void> {
  return runTrackedCleanup(deletedCleanupKey(payload.bookId), () => handleDeletedBookOfflineState(payload));
}

export function handleReadBookOfflineStateForServerEvent(payload: BookReadChangedPayload): Promise<void> {
  if (payload.isRead !== true) return Promise.resolve();
  return runTrackedCleanup(readCleanupKey(payload.bookId), () => handleReadBookOfflineState(payload));
}

export function registerOfflineBookDeletionHandler(
  bus: EventBus = domainEvents,
  cleanup: DeletedCleanup = handleDeletedBookOfflineState,
): () => void {
  return bus.subscribe("bookDeleted", (payload) => {
    void runTrackedCleanup(deletedCleanupKey(payload.bookId), () => cleanup(payload)).catch((error) => {
      console.warn("Failed to remove deleted book local state", error);
    });
  });
}

export function registerOfflineBookReadHandler(
  bus: EventBus = domainEvents,
  cleanup: ReadCleanup = handleReadBookOfflineState,
): () => void {
  return bus.subscribe("bookReadChanged", (payload) => {
    if (payload.isRead !== true) return;
    void runTrackedCleanup(readCleanupKey(payload.bookId), () => cleanup(payload)).catch((error) => {
      console.warn("Failed to remove read book local state", error);
    });
  });
}
