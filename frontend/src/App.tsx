import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./auth";

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
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><CatalogPage /></ProtectedRoute>} />
      <Route path="/book/:id" element={<ProtectedRoute><BookPage /></ProtectedRoute>} />
      <Route path="/book/:id/edit" element={<ProtectedRoute adminOnly><BookEditPage /></ProtectedRoute>} />
      <Route path="/book/:id/similar" element={<ProtectedRoute><SimilarBooksPage /></ProtectedRoute>} />
      <Route path="/authors" element={<ProtectedRoute><AuthorsPage /></ProtectedRoute>} />
      <Route path="/authors/:id" element={<ProtectedRoute><AuthorPage /></ProtectedRoute>} />
      <Route path="/series" element={<ProtectedRoute><SeriesListPage /></ProtectedRoute>} />
      <Route path="/series/:id" element={<ProtectedRoute><SeriesPage /></ProtectedRoute>} />
      <Route path="/tags" element={<ProtectedRoute><TagsPage /></ProtectedRoute>} />
      <Route path="/tags/:id" element={<ProtectedRoute><TagPage /></ProtectedRoute>} />
      <Route path="/shelves/:id" element={<ProtectedRoute><ShelfPage /></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute adminOnly><UploadPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
      <Route path="*" element={<ProtectedRoute><NotFoundPage /></ProtectedRoute>} />
    </Routes>
  );
}
