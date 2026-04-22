import { Folder, FileText, Image, Video, Sheet, Presentation, File, Music, Archive, Code } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function getDriveIcon(mimeType: string): { Icon: LucideIcon; color: string } {
  if (mimeType === 'application/vnd.google-apps.folder')
    return { Icon: Folder, color: 'text-amber-500' };
  if (mimeType === 'application/vnd.google-apps.document')
    return { Icon: FileText, color: 'text-blue-500' };
  if (mimeType === 'application/vnd.google-apps.spreadsheet')
    return { Icon: Sheet, color: 'text-green-500' };
  if (mimeType === 'application/vnd.google-apps.presentation')
    return { Icon: Presentation, color: 'text-orange-500' };
  if (mimeType === 'application/pdf') return { Icon: FileText, color: 'text-red-500' };
  if (mimeType.startsWith('image/')) return { Icon: Image, color: 'text-purple-500' };
  if (mimeType.startsWith('video/')) return { Icon: Video, color: 'text-pink-500' };
  if (mimeType.startsWith('audio/')) return { Icon: Music, color: 'text-cyan-500' };
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar'))
    return { Icon: Archive, color: 'text-yellow-600' };
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html'))
    return { Icon: Code, color: 'text-teal-500' };
  return { Icon: File, color: 'text-muted-foreground' };
}

export function isFolder(mimeType: string): boolean {
  return mimeType === 'application/vnd.google-apps.folder';
}

export function formatBytes(bytes?: string | number): string {
  if (!bytes) return '—';
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let value = n;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDriveDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function getMimeCategory(mimeType: string): 'folder' | 'document' | 'image' | 'video' | 'pdf' | 'other' {
  if (isFolder(mimeType)) return 'folder';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'application/vnd.google-apps.presentation' ||
    mimeType.includes('msword') ||
    mimeType.includes('officedocument') ||
    mimeType.includes('text/')
  )
    return 'document';
  return 'other';
}
