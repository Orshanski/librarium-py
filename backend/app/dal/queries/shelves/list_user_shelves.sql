-- name: list_user_shelves(uid)
SELECT sh.*, COUNT(sb.book_id) as book_count
FROM shelves sh LEFT JOIN shelf_books sb ON sh.id = sb.shelf_id
WHERE sh.user_id = :uid GROUP BY sh.id ORDER BY sh.is_system DESC, sh.name
