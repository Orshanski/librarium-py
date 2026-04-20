-- name: count_series_books(id)^
SELECT COUNT(*) as c FROM books WHERE series_id = :id
