import type { Env } from '../env';

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON を HTML 内の <script type="application/json"> に安全に埋め込む */
export function jsonForHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return (Math.round(v * 10) / 10) + ' ' + units[i];
}

export function formatDate(v: string | number | Date | null): string {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return '';
  }
}

/** LIKE パターン用エスケープ（`ESCAPE '\\'` と併用し、% と _ をリテラルとして扱う） */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function slugify(s: string): string {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'tag';
}

export function parseTags(input: string): string[] {
  if (!input) return [];
  const arr = input.split(',').map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of arr) {
    const norm = t.slice(0, 20);
    if (norm.length < 3) continue;
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
    if (out.length >= 5) break;
  }
  return out;
}

export function extractExt(name: string): string {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  const ext = base.slice(dot + 1).toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(ext)) return '';
  return '.' + ext;
}

export function inferExtFromContentType(ct: string): string {
  const t = String(ct || '').toLowerCase();
  if (t === 'image/png') return 'png';
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/avif') return 'avif';
  if (t === 'video/mp4') return 'mp4';
  if (t === 'video/webm') return 'webm';
  if (t === 'video/quicktime') return 'mov';
  if (t === 'audio/mpeg' || t === 'audio/mp3') return 'mp3';
  if (t === 'audio/wav' || t === 'audio/x-wav') return 'wav';
  if (t === 'audio/ogg') return 'ogg';
  if (t === 'audio/flac') return 'flac';
  if (t === 'audio/mp4' || t === 'audio/x-m4a') return 'm4a';
  if (t === 'model/gltf-binary') return 'glb';
  if (t === 'model/gltf+json') return 'gltf';
  if (t === 'model/obj') return 'obj';
  return '';
}

export function isAllowedByConfig(extNoDot: string, contentType: string, env: Env): boolean {
  try {
    const allowed = String(env.ALLOWED_FILE_TYPES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length) return true;
    const ext = extNoDot?.toLowerCase() || '';
    if (ext && allowed.includes(ext)) return true;
    const inferred = inferExtFromContentType(contentType);
    if (inferred && allowed.includes(inferred)) return true;
    // jpeg / jpg の揺れを吸収
    if (ext === 'jpeg' && allowed.includes('jpg')) return true;
    if (ext === 'jpg' && allowed.includes('jpeg')) return true;
    return false;
  } catch {
    return true;
  }
}

/** Content-Disposition 用にファイル名をサニタイズし RFC 5987 の filename* も付与する */
export function contentDispositionFilename(filename: string, disposition: 'inline' | 'attachment'): string {
  const raw = String(filename || 'download');
  // ヘッダーインジェクション対策: 制御文字と引用符・バックスラッシュを除去
  const ascii = raw
    .replace(/[\r\n"\\]/g, '')
    .replace(/[^\x20-\x7E]+/g, '_')
    .trim() || 'download';
  const encoded = encodeURIComponent(raw).replace(/'/g, '%27');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Supabase user id から表示用ユーザー名を生成（小文字英数・10文字） */
export function normalizeUsernameFromId(uid: string): string {
  const base = String(uid || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const s = base || 'user';
  return s.slice(0, 10).padEnd(3, '0');
}

export function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
