import { colors } from "../theme";

/**
 * Сообщение о сбое загрузки в теле страницы.
 *
 * role="alert" — чтобы программа чтения с экрана объявила подмену «Загрузка...» на
 * сообщение: фокус при этом не меняется, само по себе появление текста не озвучится.
 * Тот же приём и тот же цвет, что у сообщения в боковой панели.
 */
export default function LoadFailureNotice() {
  return (
    <div role="alert" style={{ textAlign: "center", padding: 48, color: colors.danger }}>
      Не удалось загрузить
    </div>
  );
}
