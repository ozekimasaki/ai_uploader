import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import {
  contentDispositionFilename,
  extractExt,
  formatBytes,
  inferExtFromContentType,
  isAllowedByConfig,
  normalizeUsernameFromId,
  parseTags,
  slugify,
} from '../src/lib/util';

const envWith = (allowed: string) => ({ ALLOWED_FILE_TYPES: allowed }) as unknown as Env;

describe('util', () => {
  it('parseTags: 最大5件・3〜20文字・重複除去', () => {
    expect(parseTags('aaa,bbb,ccc')).toEqual(['aaa', 'bbb', 'ccc']);
    expect(parseTags('ab,abc')).toEqual(['abc']); // 2文字は除外
    expect(parseTags('x'.repeat(25))).toEqual(['x'.repeat(20)]); // 20文字に丸め
    expect(parseTags('same,same,other')).toEqual(['same', 'other']);
    expect(parseTags('a,b,c,d,e,f'.replace(/[a-f]/g, (c) => c + c + c))).toHaveLength(5);
    expect(parseTags('')).toEqual([]);
  });

  it('slugify: 小文字・記号をハイフン化', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('  AI_2024  ')).toBe('ai-2024');
    expect(slugify('日本語')).toBe('tag');
  });

  it('extractExt: 拡張子を小文字で返す', () => {
    expect(extractExt('a/b/c.PNG')).toBe('.png');
    expect(extractExt('noext')).toBe('');
    expect(extractExt('.hidden')).toBe('');
    expect(extractExt('file.tar.gz')).toBe('.gz');
  });

  it('inferExtFromContentType', () => {
    expect(inferExtFromContentType('image/png')).toBe('png');
    expect(inferExtFromContentType('audio/mpeg')).toBe('mp3');
    expect(inferExtFromContentType('model/gltf-binary')).toBe('glb');
    expect(inferExtFromContentType('application/octet-stream')).toBe('');
  });

  it('isAllowedByConfig: 拡張子または Content-Type で判定', () => {
    const env = envWith('png,mp4');
    expect(isAllowedByConfig('png', 'image/png', env)).toBe(true);
    expect(isAllowedByConfig('exe', 'application/octet-stream', env)).toBe(false);
    expect(isAllowedByConfig('', 'video/mp4', env)).toBe(true);
    expect(isAllowedByConfig('jpeg', 'image/jpeg', envWith('jpg'))).toBe(true);
    // 空設定は許可
    expect(isAllowedByConfig('xyz', 'application/x-xyz', envWith(''))).toBe(true);
  });

  it('contentDispositionFilename: 制御文字・引用符を除去し filename* を付与', () => {
    const h = contentDispositionFilename('file".png', 'attachment');
    expect(h).toContain('filename="file.png"');
    expect(h).toContain("filename*=UTF-8''");
    const inj = contentDispositionFilename('a\r\nX: y.txt', 'attachment');
    expect(inj).not.toContain('\r');
    expect(inj).not.toContain('\n');
    const nonAscii = contentDispositionFilename('画像.png', 'attachment');
    expect(nonAscii).toContain('filename="_.png"');
    expect(decodeURIComponent(nonAscii.split("filename*=UTF-8''")[1])).toBe('画像.png');
  });

  it('normalizeUsernameFromId: 小文字英数10文字', () => {
    expect(normalizeUsernameFromId('ABCD-EFGH-IJKL')).toBe('abcdefghij');
    expect(normalizeUsernameFromId('x')).toBe('x00');
    expect(normalizeUsernameFromId('')).toBe('user');
  });

  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(-1)).toBe('-');
  });
});
