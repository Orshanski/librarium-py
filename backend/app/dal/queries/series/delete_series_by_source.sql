-- name: delete_series_by_source(source)!
DELETE FROM series WHERE id = :source
