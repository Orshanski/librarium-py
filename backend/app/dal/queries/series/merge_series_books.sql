-- name: merge_series_books(target, source)!
UPDATE books SET series_id = :target WHERE series_id = :source
