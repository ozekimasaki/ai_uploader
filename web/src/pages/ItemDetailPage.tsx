import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function ItemDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const { session } = useAuth();

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError('');
      const headers: Record<string, string> = {};
      if (session.accessToken) headers['authorization'] = `Bearer ${session.accessToken}`;
      const res = await fetch(`/api/items/${id}`, { headers });
      if (res.ok) {
        setItem(await res.json().then((d) => d.item));
      } else if (res.status === 403) {
        setError('このアイテムは非公開です（所有者のみ閲覧可能）');
      } else if (res.status === 404) {
        setError('見つかりませんでした');
      } else {
        setError('読み込みに失敗しました');
      }
      setLoading(false);
    })();
  }, [id, session.accessToken]);

  if (loading) return <p>読み込み中...</p>;
  if (error) return <p>{error}</p>;
  if (!item) return <p>見つかりませんでした。</p>;

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{item.title}</h1>
      <div className="text-gray-600">{item.description}</div>
      <div className="text-sm text-gray-500">カテゴリ: {item.category} / 可視性: {item.visibility}</div>
    </div>
  );
}


