import { useLocation } from "react-router-dom";

/**
 * Рендерит текущий адрес в `data-testid="loc"`.
 * Для тестов, проверяющих навигацию внутри страницы: рендерится рядом с
 * компонентом страницы внутри одного роутера.
 */
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname + location.search}</div>;
}
