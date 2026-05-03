import { domainEvents } from "@/domain/events";
import { registerOfflineBookDeletionHandler } from "./book-deletion";

let installed = false;

export function installOfflineStorageHandlersForApp(): void {
  if (installed) return;
  registerOfflineBookDeletionHandler(domainEvents);
  installed = true;
}

export function resetOfflineStorageHandlersForTests(): void {
  installed = false;
}
