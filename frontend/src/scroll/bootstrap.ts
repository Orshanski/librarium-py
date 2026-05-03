import { domainEvents } from "@/domain/events";
import { registerScrollInvalidationHandlers } from "./list-scroll-validity";

let installed = false;

export function installScrollInvalidationHandlersForApp(): void {
  if (installed) return;
  registerScrollInvalidationHandlers(domainEvents);
  installed = true;
}
