import { domainEvents } from "@/domain/events";
import { metadataCache } from "./index";
import { registerMetadataCacheHandlers } from "./handlers";

let installed = false;

export function installMetadataCacheHandlersForApp(): void {
  if (installed) return;
  registerMetadataCacheHandlers(metadataCache, domainEvents);
  installed = true;
}
