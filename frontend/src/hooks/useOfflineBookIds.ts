import { useState, useEffect } from "react";
import { getOfflineBookIds } from "../utils/offline-storage";
import { domainEvents } from "@/domain/events";
import { useIsPwa } from "./useIsPwa";

const EMPTY: ReadonlySet<number> = new Set<number>();

/**
 * Идентификаторы книг, сохранённых офлайн, — для бейджа «скачано» в списках.
 *
 * Возвращает ПОЛНЫЙ набор сохранённых книг, а не пересечение с чем-либо: списку нужен
 * только предикат «эта книга сохранена». Отсюда и отсутствие параметров — прежняя
 * сигнатура принимала массив идентификаторов, но использовала лишь его длину, и каждый
 * вызывающий городил useMemo ради неё.
 *
 * Набор пуст вне установленного приложения: офлайн-хранилище там не ведётся.
 *
 * Подписка на offlineBookChanged обязательна: без неё набор оставался снимком на момент
 * отрисовки, и на странице книги бейдж в рельсе серии расходился с состоянием в шапке —
 * сохранил книгу, облачко в шапке загорелось, а на карточке той же книги рядом нет.
 */
export function useOfflineBookIds(): ReadonlySet<number> {
  const isPwa = useIsPwa();
  const [offlineIds, setOfflineIds] = useState<ReadonlySet<number>>(EMPTY);

  useEffect(() => {
    if (!isPwa) {
      // Пустое множество — модульная константа: новый объект на каждый вызов считался бы
      // изменением состояния и заставлял перерисовываться всех потребителей впустую.
      setOfflineIds((prev) => (prev.size === 0 ? prev : EMPTY));
      return undefined;
    }

    let cancelled = false;

    function reload() {
      getOfflineBookIds()
        .then((ids) => {
          if (!cancelled) setOfflineIds(new Set(ids));
        })
        .catch((err) => {
          console.warn("Failed to load offline book IDs:", err);
          if (!cancelled) setOfflineIds(EMPTY);
        });
    }

    reload();
    const unsubscribe = domainEvents.subscribe("offlineBookChanged", reload);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isPwa]);

  return offlineIds;
}
