-- name: list_series_options()
SELECT DISTINCT s.id, s.name FROM series s
JOIN books b ON b.series_id = s.id
{where_clause} ORDER BY s.name COLLATE NOCASE
