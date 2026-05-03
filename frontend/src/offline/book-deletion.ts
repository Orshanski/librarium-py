import { domainEvents, type DomainEventMap } from "@/domain/events";
import { removeBookFromLocalStorage } from "@/utils/offline-storage";

type EventBus = typeof domainEvents;
type BookDeletedPayload = DomainEventMap["bookDeleted"];
type Cleanup = (payload: BookDeletedPayload) => Promise<void>;

export async function handleDeletedBookOfflineState(payload: BookDeletedPayload): Promise<void> {
  await removeBookFromLocalStorage(payload.bookId);
}

export function registerOfflineBookDeletionHandler(
  bus: EventBus = domainEvents,
  cleanup: Cleanup = handleDeletedBookOfflineState,
): () => void {
  return bus.subscribe("bookDeleted", (payload) => {
    void cleanup(payload).catch((error) => {
      console.warn("Failed to remove deleted book local state", error);
    });
  });
}
