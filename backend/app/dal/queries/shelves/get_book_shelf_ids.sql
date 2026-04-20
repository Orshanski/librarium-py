-- name: get_book_shelf_ids(book_id, user_id)
SELECT sb.shelf_id FROM shelf_books sb
JOIN shelves s ON sb.shelf_id = s.id
WHERE sb.book_id = :book_id AND s.user_id = :user_id
