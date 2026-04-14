import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: false },
    })
  : null;

export const PHOTO_BUCKET = 'photos';

// data URL → Blob 변환 (사진 업로드용)
export function dataURLToBlob(dataURL) {
  const [header, base64] = dataURL.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(base64);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

// 사진 업로드 → public URL 반환
// - 이미 http로 시작하는 기존 URL이면 그대로 리턴
// - data: URL이면 Storage에 업로드 후 새 URL 리턴
export async function uploadPhotoIfNeeded(photo) {
  if (!photo) return null;
  if (photo.startsWith('http')) return photo;
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.');

  const blob = dataURLToBlob(photo);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filename, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
    });
  if (error) throw error;

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

// Storage에서 사진 삭제 (URL에서 경로 추출)
export async function deletePhotoFromStorage(url) {
  if (!url || !supabase) return;
  const marker = `/${PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  } catch (e) {
    console.warn('사진 삭제 실패 (무시됨):', e);
  }
}
