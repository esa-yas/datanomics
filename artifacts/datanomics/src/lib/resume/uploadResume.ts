import { supabase } from '@/lib/supabase';

export async function uploadResumeFile(
  candidateId: string,
  file: File,
): Promise<{ pdfUrl?: string; docxUrl?: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const path = `${candidateId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;

  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(data.path);
  if (ext === 'pdf') return { pdfUrl: publicUrl };
  if (ext === 'docx') return { docxUrl: publicUrl };
  return {};
}
