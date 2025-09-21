import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type Item = any;

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch('/api/items');
      const data = await res.json();
      setItems(data.items || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">一覧</h1>
      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((it: any) => (
            <li key={it.id} className="border rounded hover:bg-gray-50">
              <Link to={`/items/${it.id}`} className="block p-3">
                <div className="font-semibold truncate">{it.title ?? 'Untitled'}</div>
                <div className="text-sm text-gray-500">{it.category}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


