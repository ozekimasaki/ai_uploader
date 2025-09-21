import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
function NotFound() {
  return <div>ページが見つかりません。</div>;
}
import HomePage from './HomePage';
import ItemsPage from './ItemsPage';
import ItemDetailPage from './ItemDetailPage';
import UploadPage from './UploadPage';
import { useAuth } from '../lib/auth';

export default function App() {
  const { session, signIn, signOut } = useAuth();
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <header className="border-b">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <Link to="/" className="font-bold">AI Uploader</Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link to="/items">一覧</Link>
              <Link to="/upload">アップロード</Link>
              {session.userId ? (
                <button className="px-3 py-1 border rounded" onClick={signOut}>ログアウト</button>
              ) : (
                <button className="px-3 py-1 border rounded" onClick={signIn}>ログイン</button>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto max-w-5xl px-4 py-6">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}


