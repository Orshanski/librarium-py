#!/usr/bin/env python3
"""One-time migration: seed tag_mappings from FB2 genre dictionary.

Usage:
    python scripts/seed_tag_mappings.py [path/to/db.sqlite]

Default path: ../../data/db.sqlite (relative to script location).
"""
import sqlite3
import sys
from pathlib import Path

FB2_GENRES: dict[str, str] = {
    "sf_history": "Альтернативная история",
    "sf_action": "Боевая фантастика",
    "sf_epic": "Эпическая фантастика",
    "sf_heroic": "Героическая фантастика",
    "sf_detective": "Детективная фантастика",
    "sf_cyberpunk": "Киберпанк",
    "sf_space": "Космическая фантастика",
    "sf_social": "Социальная фантастика",
    "sf_horror": "Ужасы и мистика",
    "sf_humor": "Юмористическая фантастика",
    "sf_fantasy": "Фэнтези",
    "sf": "Научная фантастика",
    "sf_stimpank": "Стимпанк",
    "sf_technofantas": "Технофэнтези",
    "sf_litrpg": "ЛитРПГ",
    "sf_postapocalyptic": "Постапокалипсис",
    "sf_mystic": "Мистика",
    "sf_etc": "Прочая фантастика",
    "fairy_tales": "Сказки",
    "love_sf": "Любовная фантастика",
    "sf_fantasy_city": "Городское фэнтези",
    "sf_reallife": "Реализм",
    "popadanec": "Попаданцы",
    "russian_fantasy": "Славянское фэнтези",
    "foreign_fantasy": "Зарубежное фэнтези",
    "sf_writing": "Фантастика: прочее",
    "det_classic": "Классический детектив",
    "det_police": "Полицейский детектив",
    "det_action": "Боевик",
    "det_irony": "Иронический детектив",
    "det_history": "Исторический детектив",
    "det_espionage": "Шпионский детектив",
    "det_crime": "Криминальный детектив",
    "det_political": "Политический детектив",
    "det_maniac": "Маньяки",
    "det_hard": "Крутой детектив",
    "thriller": "Триллер",
    "detective": "Детектив",
    "det_cozy": "Уютный детектив",
    "det_su": "Советский детектив",
    "det_all": "Детектив: прочее",
    "prose_classic": "Классическая проза",
    "prose_history": "Историческая проза",
    "prose_contemporary": "Современная проза",
    "prose_counter": "Контркультура",
    "prose_rus_classic": "Русская классическая проза",
    "prose_su_classics": "Советская классическая проза",
    "prose_military": "Военная проза",
    "prose": "Проза",
    "prose_abs": "Абсурдистская проза",
    "prose_game": "Игровая проза",
    "prose_magic": "Магический реализм",
    "prose_neformatnyj": "Неформатная проза",
    "short_story": "Рассказ",
    "great_story": "Повесть",
    "prose_all": "Проза: прочее",
    "love_contemporary": "Современные любовные романы",
    "love_history": "Исторические любовные романы",
    "love_detective": "Любовно-детективные романы",
    "love_short": "Короткие любовные романы",
    "love_erotica": "Эротика",
    "love": "Любовный роман",
    "love_hard": "Остросюжетные любовные романы",
    "love_all": "Любовные романы: прочее",
    "adv_western": "Вестерн",
    "adv_history": "Исторические приключения",
    "adv_indian": "Приключения про индейцев",
    "adv_maritime": "Морские приключения",
    "adv_geo": "Путешествия и география",
    "adv_animal": "Природа и животные",
    "adventure": "Приключения",
    "adv_all": "Приключения: прочее",
    "child_tale": "Детские сказки",
    "child_verse": "Детские стихи",
    "child_prose": "Детская проза",
    "child_sf": "Детская фантастика",
    "child_det": "Детские детективы",
    "child_adv": "Детские приключения",
    "child_education": "Детская образовательная литература",
    "children": "Детская литература",
    "child_all": "Детская литература: прочее",
    "ya": "Подростковая литература",
    "poetry": "Поэзия",
    "dramaturgy": "Драматургия",
    "vers_libre": "Верлибр",
    "visual_poetry": "Визуальная поэзия",
    "lyrics": "Лирика",
    "palindromes": "Палиндромы",
    "song_poetry": "Песенная поэзия",
    "experimental_poetry": "Экспериментальная поэзия",
    "epic_poetry": "Эпическая поэзия",
    "in_verse": "В стихах",
    "antique_ant": "Античная литература",
    "antique_european": "Европейская старинная литература",
    "antique_russian": "Древнерусская литература",
    "antique_east": "Древневосточная литература",
    "antique_myths": "Мифы. Легенды. Эпос",
    "antique": "Старинная литература",
    "antique_all": "Старинная литература: прочее",
    "sci_history": "История",
    "sci_psychology": "Психология",
    "sci_culture": "Культурология",
    "sci_religion": "Религиоведение",
    "sci_philosophy": "Философия",
    "sci_politics": "Политика",
    "sci_business": "Деловая литература",
    "sci_juris": "Юриспруденция",
    "sci_linguistic": "Языкознание",
    "sci_medicine": "Медицина",
    "sci_phys": "Физика",
    "sci_math": "Математика",
    "sci_chem": "Химия",
    "sci_biology": "Биология",
    "sci_tech": "Технические науки",
    "sci_ecology": "Экология",
    "sci_geo": "Геология и география",
    "science": "Наука и образование",
    "sci_cosmos": "Астрономия и космос",
    "sci_pedagogy": "Педагогика",
    "sci_social_studies": "Обществознание",
    "sci_economy": "Экономика",
    "sci_transport": "Транспорт",
    "sci_state": "Государство и право",
    "sci_all": "Наука и образование: прочее",
    "comp_www": "Интернет",
    "comp_programming": "Программирование",
    "comp_hard": "Компьютерное железо",
    "comp_soft": "Программы",
    "comp_db": "Базы данных",
    "comp_osnet": "ОС и сети",
    "computers": "Компьютеры и интернет",
    "comp_all": "Компьютеры и интернет: прочее",
    "ref_encyc": "Энциклопедии",
    "ref_dict": "Словари",
    "ref_ref": "Справочники",
    "ref_guide": "Путеводители",
    "reference": "Справочная литература",
    "ref_all": "Справочная литература: прочее",
    "nonf_biography": "Биографии и мемуары",
    "nonf_publicism": "Публицистика",
    "nonf_criticism": "Критика",
    "design": "Искусство и дизайн",
    "nonfiction": "Документальная литература",
    "nonf_military": "Военная документалистика",
    "travel_notes": "Путевые заметки",
    "nonf_all": "Документальная литература: прочее",
    "religion_rel": "Религия",
    "religion_esoterics": "Эзотерика",
    "religion_self": "Самосовершенствование",
    "religion_budda": "Буддизм",
    "religion_christianity": "Христианство",
    "religion_islam": "Ислам",
    "religion_hinduism": "Индуизм",
    "religion_judaism": "Иудаизм",
    "religion_paganism": "Язычество",
    "religion": "Религия и духовность",
    "religion_all": "Религия и духовность: прочее",
    "humor_anecdote": "Анекдоты",
    "humor_prose": "Юмористическая проза",
    "humor_verse": "Юмористические стихи",
    "humor": "Юмор",
    "humor_satire": "Сатира",
    "humor_all": "Юмор: прочее",
    "home_cooking": "Кулинария",
    "home_pets": "Домашние животные",
    "home_crafts": "Хобби и ремёсла",
    "home_entertain": "Развлечения",
    "home_health": "Здоровье",
    "home_garden": "Сад и огород",
    "home_diy": "Сделай сам",
    "home_sport": "Спорт",
    "home_sex": "Эротика, секс",
    "home": "Дом, семья",
    "home_all": "Дом, семья: прочее",
    "busines": "Деловая литература",
    "business": "Деловая литература",
    "org_behavior": "Корпоративная культура",
    "banking": "Банковское дело",
    "accounting": "Бухгалтерский учёт",
    "global_economy": "Мировая экономика",
    "marketing": "Маркетинг",
    "stock": "Ценные бумаги",
    "management": "Менеджмент",
    "small_business": "Малый бизнес",
    "paper_work": "Делопроизводство",
    "economics_ref": "Экономика: справочники",
    "industries": "Отраслевые издания",
    "job_hunting": "Поиск работы",
    "real_estate": "Недвижимость",
    "popular_business": "Бизнес: популярное",
    "personal_finance": "Личные финансы",
    "other": "Прочее",
    "network_literature": "Сетевая литература",
    "fanfiction": "Фанфик",
    "unfinished": "Незавершённое",
    "comics": "Комиксы",
    "essay": "Эссе",
    "epistolary_fiction": "Эпистолярная проза",
    "notes": "Заметки",
    "periodic": "Периодика",
    "humor_fantasy": "Юмористическое фэнтези",
    "gothic_novel": "Готический роман",
    "boxing": "Единоборства",
    "foreign_prose": "Зарубежная проза",
    "foreign_adventure": "Зарубежные приключения",
    "foreign_detective": "Зарубежные детективы",
    "foreign_love": "Зарубежные любовные романы",
    "foreign_antique": "Зарубежная старинная литература",
    "foreign_children": "Зарубежная детская литература",
    "foreign_comp": "Зарубежная компьютерная литература",
    "foreign_home": "Зарубежная прикладная литература",
    "foreign_humor": "Зарубежный юмор",
    "foreign_business": "Зарубежная деловая литература",
    "foreign_education": "Зарубежная образовательная литература",
    "foreign_psychology": "Зарубежная психология",
    "foreign_publicism": "Зарубежная публицистика",
    "foreign_religion": "Зарубежная эзотерическая литература",
    "foreign_sf": "Зарубежная фантастика",
    "geography_book": "Книги о путешествиях",
    "geo_guides": "Путеводители",
    "music": "Музыка",
    "cinema": "Кино",
    "theatre": "Театр",
    "visual_arts": "Изобразительное искусство",
    "photo_art": "Фотоискусство",
    "cine_horror": "Хоррор",
    "thriller_legal": "Юридический триллер",
    "thriller_medical": "Медицинский триллер",
    "thriller_techno": "Технотриллер",
    "military_special": "Спецслужбы",
    "military_weapon": "Оружие и военная техника",
    "military_arts": "Военное искусство",
}


def seed(db_path: str):
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")

    # Create table if not exists
    db.execute("""
        CREATE TABLE IF NOT EXISTS tag_mappings (
            raw_tag TEXT PRIMARY KEY,
            tag_id INTEGER NOT NULL REFERENCES tags(id)
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_tag_mappings_tag ON tag_mappings(tag_id)")

    existing = db.execute("SELECT COUNT(*) as c FROM tag_mappings").fetchone()["c"]
    print(f"Existing mappings: {existing}")

    added = 0
    for code, name in FB2_GENRES.items():
        if db.execute("SELECT 1 FROM tag_mappings WHERE raw_tag = ?", (code,)).fetchone():
            continue
        db.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (name,))
        row = db.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()
        if row:
            db.execute("INSERT OR IGNORE INTO tag_mappings (raw_tag, tag_id) VALUES (?, ?)",
                       (code, row["id"]))
            added += 1

    # Self-mappings for orphan tags
    orphans = db.execute("""
        SELECT id, name FROM tags
        WHERE id NOT IN (SELECT tag_id FROM tag_mappings)
    """).fetchall()
    for tag in orphans:
        db.execute("INSERT OR IGNORE INTO tag_mappings (raw_tag, tag_id) VALUES (?, ?)",
                   (tag["name"], tag["id"]))
        added += 1

    db.commit()
    total = db.execute("SELECT COUNT(*) as c FROM tag_mappings").fetchone()["c"]
    print(f"Added: {added}, Total mappings: {total}")
    db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        path = str(Path(__file__).parent.parent.parent / "data" / "db.sqlite")
    print(f"Database: {path}")
    seed(path)
    print("Done.")
