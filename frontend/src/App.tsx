import { Routes, Route, Outlet } from "react-router-dom";
import { ProtectedRoute } from "./auth";
import Shell from "./components/shell";

import CatalogPage from "./pages/CatalogPage";
import LoginPage from "./pages/LoginPage";
import BookPage from "./pages/BookPage";
import BookEditPage from "./pages/BookEditPage";
import AuthorsPage from "./pages/AuthorsPage";
import AuthorPage from "./pages/AuthorPage";
import SeriesListPage from "./pages/SeriesListPage";
import SeriesPage from "./pages/SeriesPage";
import TagsPage from "./pages/TagsPage";
import TagPage from "./pages/TagPage";
import ShelfPage from "./pages/ShelfPage";
import SearchPage from "./pages/SearchPage";
import UploadPage from "./pages/UploadPage";
import AdminPage from "./pages/AdminPage";
import SimilarBooksPage from "./pages/SimilarBooksPage";
import ReaderPage from "./pages/ReaderPage";
import NotFoundPage from "./pages/NotFoundPage";

function ShellLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/book/:id/read/:format" element={<ProtectedRoute><ReaderPage /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><ShellLayout /></ProtectedRoute>}>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/book/:id" element={<BookPage />} />
        <Route path="/book/:id/edit" element={<ProtectedRoute adminOnly><BookEditPage /></ProtectedRoute>} />
        <Route path="/book/:id/similar" element={<SimilarBooksPage />} />
        <Route path="/authors" element={<AuthorsPage />} />
        <Route path="/authors/:id" element={<AuthorPage />} />
        <Route path="/series" element={<SeriesListPage />} />
        <Route path="/series/:id" element={<SeriesPage />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/tags/:id" element={<TagPage />} />
        <Route path="/shelves/:id" element={<ShelfPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/upload" element={<ProtectedRoute adminOnly><UploadPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
