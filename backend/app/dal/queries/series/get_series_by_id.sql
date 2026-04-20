-- name: get_series_by_id(id)^
SELECT s.*, COUNT(b.id) as book_count
FROM series s
LEFT JOIN books b ON b.series_id = s.id
WHERE s.id = :id
GROUP BY s.id
