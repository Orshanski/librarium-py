import type { ReaderNavigationRequest } from "../types/reader-handle";
import type { ReaderViewElement } from "../types/reader-foliate";

interface NavigationControllerCallbacks {
  onSavePosition: () => void;
  onReady: () => void;
  isDisposed: () => boolean;
}

export interface NavigationController {
  enqueueNavigation: (
    task: () => Promise<void>,
    options?: { persist?: boolean; allowDuringInit?: boolean },
  ) => Promise<void>;
  performNavigation: (request: ReaderNavigationRequest) => Promise<void>;
  savePosition: () => void;
  setInteractive: () => void;
  setContentLoaded: () => void;
  isInteractive: () => boolean;
}

export function createNavigationController(
  view: ReaderViewElement,
  callbacks: NavigationControllerCallbacks,
): NavigationController {
  let interactive = false;
  let contentLoaded = false;
  let readyNotified = false;
  let queue: Promise<void> = Promise.resolve();

  const notifyReady = () => {
    if (!contentLoaded || !interactive || readyNotified) return;
    readyNotified = true;
    callbacks.onReady();
  };

  const enqueueNavigation = (
    task: () => Promise<void>,
    options?: { persist?: boolean; allowDuringInit?: boolean },
  ): Promise<void> => {
    const { persist = true, allowDuringInit = false } = options ?? {};
    const run = async () => {
      if (callbacks.isDisposed()) return;
      if (!allowDuringInit && !interactive) return;
      try {
        await task();
        if (persist) callbacks.onSavePosition();
      } finally {
        notifyReady();
      }
    };
    queue = queue
      .catch((err) => {
        if (location.hostname === "localhost") {
          console.error("[reader] navigation failed:", err);
        }
      })
      .then(run);
    return queue;
  };

  const performNavigation = (request: ReaderNavigationRequest): Promise<void> => {
    if (request.type === "goTo") {
      return enqueueNavigation(() => view.goTo(request.target), {
        persist: request.persist,
        allowDuringInit: request.allowDuringInit,
      });
    }
    if (request.type === "prev") {
      return enqueueNavigation(() => view.prev(), {
        persist: request.persist,
        allowDuringInit: request.allowDuringInit,
      });
    }
    return enqueueNavigation(() => view.next(), {
      persist: request.persist,
      allowDuringInit: request.allowDuringInit,
    });
  };

  return {
    enqueueNavigation,
    performNavigation,
    savePosition: () => callbacks.onSavePosition(),
    setInteractive: () => { interactive = true; notifyReady(); },
    setContentLoaded: () => { contentLoaded = true; notifyReady(); },
    isInteractive: () => interactive,
  };
}
