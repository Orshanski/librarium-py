import { lazy, Suspense, useEffect, useRef } from "react";
import { Routes, Route, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ProtectedRoute } from "./auth";
import Shell from "./components/shell";
import OfflineShell from "./components/OfflineShell";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { useIsPwa } from "./hooks/useIsPwa";
import ErrorBoundary from "./components/ErrorBoundary";
import { isReadingFlag, clearReadingFlag } from "./utils/readerFlag";
import { getLastReadBook } from "./utils/offline-storage";

import LoginPage from "./pages/LoginPage";
import CatalogPage from "./pages/CatalogPage";
import NotFoundPage from "./pages/NotFoundPage";

const BookPage = lazy(() => import("./pages/BookPage"));
const BookEditPage = lazy(() => import("./pages/BookEditPage"));
const AuthorsPage = lazy(() => import("./pages/AuthorsPage"));
const AuthorPage = lazy(() => import("./pages/AuthorPage"));
const SeriesListPage = lazy(() => import("./pages/SeriesListPage"));
const SeriesPage = lazy(() => import("./pages/SeriesPage"));
const TagsPage = lazy(() => import("./pages/TagsPage"));
const TagPage = lazy(() => import("./pages/TagPage"));
const ShelfPage = lazy(() => import("./pages/ShelfPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const SimilarBooksPage = lazy(() => import("./pages/SimilarBooksPage"));
const ReaderPage = lazy(() => import("./pages/ReaderPage"));

function ShellLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export default function App() {
  const online = useOnlineStatus();
  const isPwa = useIsPwa();
  const location = useLocation();
  const navigate = useNavigate();
  const wasOfflineRef = useRef(false);

  const isReading = location.pathname.match(/^\/book\/\d+\/read\//);
  const showOffline = isPwa && !online && !isReading;

  // On app mount: if the "reading" flag is set (user was in reader when the
  // process died), look up the last-read book from IndexedDB and navigate there.
  // Flag is set only by explicit "Read" taps and cleared only by explicit exit
  // (see utils/readerFlag.ts). Deep links to a reader URL are not overridden.
  useEffect(() => {
    if (!isReadingFlag()) return;
    if (isReading) return;
    (async () => {
      try {
        const last = await getLastReadBook();
        if (!last) {
          // No IDB data to restore to — clear the flag so next cold start
          // doesn't repeat this no-op dance.
          clearReadingFlag();
          return;
        }
        navigate(`/book/${last.bookId}/read/${last.lastFormat.toLowerCase()}`);
      } catch {
        // IndexedDB unavailable — stay on catalog
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track offline→online transition and navigate to catalog
  useEffect(() => {
    if (showOffline) {
      wasOfflineRef.current = true;
    } else if (online && wasOfflineRef.current) {
      wasOfflineRef.current = false;
      navigate("/", { replace: true });
    }
  }, [showOffline, online, navigate]);

  if (showOffline) {
    return <OfflineShell />;
  }

  return (
    <Suspense>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/book/:id/read/:format" element={<ProtectedRoute><ErrorBoundary title="Не удалось открыть книгу" backLabel="Назад" onBack={() => { clearReadingFlag(); window.history.back(); }}><ReaderPage /></ErrorBoundary></ProtectedRoute>} />
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
    </Suspense>
  );
}
