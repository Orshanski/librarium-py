import { domainEvents, type DomainEventMap } from "@/domain/events";
import { removeBookFromLocalStorage } from "@/utils/offline-storage";

type EventBus = typeof domainEvents;
type BookDeletedPayload = DomainEventMap["bookDeleted"];
type BookReadChangedPayload = DomainEventMap["bookReadChanged"];
type DeletedCleanup = (payload: BookDeletedPayload) => Promise<void>;
type ReadCleanup = (payload: BookReadChangedPayload) => Promise<void>;

export async function handleDeletedBookOfflineState(payload: BookDeletedPayload): Promise<void> {
  await removeBookFromLocalStorage(payload.bookId);
}

export async function handleReadBookOfflineState(payload: BookReadChangedPayload): Promise<void> {
  if (payload.isRead !== true) return;
  await removeBookFromLocalStorage(payload.bookId);
}

export function registerOfflineBookDeletionHandler(
  bus: EventBus = domainEvents,
  cleanup: DeletedCleanup = handleDeletedBookOfflineState,
): () => void {
  return bus.subscribe("bookDeleted", (payload) => {
    void cleanup(payload).catch((error) => {
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
    void cleanup(payload).catch((error) => {
      console.warn("Failed to remove read book local state", error);
    });
  });
}
