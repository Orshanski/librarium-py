-- name: insert_book(title, sort_title, description, language, publisher, pub_date, series_id, series_number, cover_path)<!
INSERT INTO books (title, sort_title, description, language, publisher, pub_date, series_id, series_number, cover_path)
VALUES (:title, :sort_title, :description, :language, :publisher, :pub_date, :series_id, :series_number, :cover_path)
