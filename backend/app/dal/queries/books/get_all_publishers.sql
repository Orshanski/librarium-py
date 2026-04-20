-- name: get_all_publishers()
SELECT DISTINCT publisher FROM books WHERE publisher IS NOT NULL AND publisher != '' ORDER BY publisher COLLATE NOCASE
