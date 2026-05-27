import { domainEvents } from "@/domain/events";
import { registerCursorCriticalServerEventHandler } from "@/sse/server-events";
import {
  handleDeletedBookOfflineStateForServerEvent,
  handleReadBookOfflineStateForServerEvent,
  registerOfflineBookDeletionHandler,
  registerOfflineBookReadHandler,
} from "./book-deletion";

let installed = false;
let unsubscribeHandlers: Array<() => void> = [];

export function installOfflineStorageHandlersForApp(): void {
  if (installed) return;
  unsubscribeHandlers = [
    registerOfflineBookDeletionHandler(domainEvents),
    registerOfflineBookReadHandler(domainEvents),
    registerCursorCriticalServerEventHandler("bookDeleted", handleDeletedBookOfflineStateForServerEvent),
    registerCursorCriticalServerEventHandler("bookReadChanged", handleReadBookOfflineStateForServerEvent),
  ];
  installed = true;
}

export function resetOfflineStorageHandlersForTests(): void {
  for (const unsubscribe of unsubscribeHandlers.splice(0)) {
    unsubscribe();
  }
  installed = false;
}
