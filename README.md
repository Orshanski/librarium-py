# Librarium

Персональная семейная библиотека. Self-hosted замена Calibre-Web.

![Catalog](docs/screenshots/01-catalog.png)

## Зачем

Домашняя коллекция электронных книг — FB2, EPUB, PDF. Загрузил файл, метаданные извлеклись автоматически, обложка на месте. Вся семья пользуется через браузер с любого устройства. Не нужен Calibre на компьютере, не нужна синхронизация — всё на сервере.

## Что умеет

### Каталог с умными фильтрами

Книги отображаются сеткой с обложками. Фильтрация по автору, серии, жанру, языку — фильтры зависимые: выбрал автора, жанры пересчитались. Сортировка по дате, названию, автору, рейтингу. Бесконечный скролл — подгружает по мере прокрутки, запоминает позицию при возврате.

![Tags](docs/screenshots/05-tags.png)

### Загрузка книг

Перетаскиваешь FB2, EPUB, PDF или ZIP — метаданные извлекаются автоматически: название, авторы, серия, номер, описание, язык, жанры, ISBN, обложка. Можно загрузить несколько файлов сразу. Перед созданием — редактирование метаданных, поиск по внешним каталогам (Litres.ru, Google Books), замена обложки. Дубликаты определяются автоматически.

![Upload](docs/screenshots/08-upload.png)

### Страница книги

Полная информация: обложка, описание, метаданные, доступные форматы для скачивания. Контекст серии — другие книги серии тут же. Рейтинг (1-5 звёзд), отметка "прочитано", добавление на полку.

![Book](docs/screenshots/02-book-detail.png)

### Редактирование

Админ может редактировать все метаданные: название, авторов, серию, описание, жанры, язык, издателя, ISBN. Замена обложки, добавление/удаление форматов файлов. Поиск метаданных во внешних каталогах — нашёл лучшее описание или обложку, подставил в пару кликов.

![Edit](docs/screenshots/11-book-edit.png)

### Полнотекстовый поиск

Поиск по названиям и описаниям книг (SQLite FTS5). Результаты группируются: авторы, серии, книги.

![Search](docs/screenshots/07-search.png)

### Полки

"Лучшее" — системная полка, автоматически собирает книги с рейтингом 4-5. Свои полки — создаёшь, добавляешь книги. Каждый пользователь видит свои полки.

### Авторы, серии, жанры

Отдельные страницы с фильтрами и подсчётом книг. Облако жанров с размером шрифта по количеству. Навигация между связанными сущностями: автор → его книги → серия → все книги серии.

![Authors](docs/screenshots/03-authors.png)

### Многопользовательский режим

Роли: админ (полный доступ, загрузка, удаление, управление пользователями) и читатель (просмотр, скачивание, рейтинги, полки). У каждого свои рейтинги и полки. Возможность скрыть книгу — она пропадает из каталога только для тебя.

### Администрирование

Управление пользователями, настройки приложения, SMTP для email-уведомлений.

![Admin](docs/screenshots/09-admin.png)

### Безопасность

- JWT-авторизация с HTTP-only cookies
- Логирование авторизации и всех мутаций (journald)
- Fail2ban + Cloudflare API — автоматический бан при переборе паролей и сканировании
- SPA route whitelist — неизвестные пути возвращают 404

## Стек

| Слой | Технология |
|------|-----------|
| Backend | Python, FastAPI, Uvicorn |
| База данных | SQLite (WAL, FTS5) |
| Авторизация | JWT + bcrypt |
| Парсинг книг | lxml (FB2/EPUB), Pillow (обложки) |
| Метаданные | Litres.ru, Google Books API |
| Frontend | React 19, TypeScript, React Router 7 |
| Сборка | Vite 6 |
| Стилизация | Inline CSS |
| CI/CD | GitHub Actions → SSH deploy |

## Быстрый старт

### Требования

- Python 3.11+
- Node.js 20+

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py          # http://localhost:8000
python run.py --dev    # с auto-reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxy /api → :8000)
npm run build          # production build → dist/
```

### Создание админа

```bash
cd backend
source venv/bin/activate
python -c "
from app.database import get_db, init_db
from app.auth import hash_password
init_db()
db = get_db()
db.execute(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    ('admin', hash_password('admin'), 'admin')
)
db.commit()
"
```

## Структура проекта

```
librarium-py/
├── backend/
│   ├── run.py              # Uvicorn server
│   ├── schema.sql          # Схема БД
│   ├── requirements.txt
│   └── app/
│       ├── main.py         # FastAPI app + SPA whitelist
│       ├── config.py       # Пути, JWT, лимиты
│       ├── database.py     # SQLite connection pool
│       ├── auth.py         # JWT + bcrypt + get_client_ip
│       ├── routers/        # API (13 модулей)
│       ├── dal/            # Data Access Layer (8 модулей)
│       ├── parsers/        # FB2, EPUB, PDF + fb2_genres.py
│       └── providers/      # Litres, Google Books
├── frontend/
│   ├── src/
│   │   ├── pages/          # 13 страниц
│   │   └── components/     # 17 компонентов
│   └── vite.config.ts
├── data/                   # Не в git
│   ├── db.sqlite
│   ├── library/{id}/       # Файлы книг + обложки
│   ├── thumbs/             # Кэш миниатюр
│   └── uploads/            # Временная загрузка
└── docs/
    ├── spec.md             # Техспека
    ├── backlog.md          # Бэклог
    └── screenshots/        # Скриншоты
```

## Деплой

CI/CD: GitHub Actions деплоит на push в `main` — git pull, pip install, vite build, restart service.

```bash
ssh lib                    # Hetzner VM
sudo systemctl status librarium
sudo journalctl -u librarium -f
```

## Документация

- [Техспека](docs/spec.md) — архитектура, API, схема БД, безопасность
- [Бэклог](docs/backlog.md) — планы развития
