import { supabase } from '@/lib/supabase';

export interface StaffDataImport {
  id: string;
  staff_user_id: string;
  import_data: Record<string, unknown>;
  raw_text: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { display_name: string; email: string } | null;
}

export const staffImportService = {
  async getForStaff(staffUserId: string): Promise<StaffDataImport | null> {
    const { data, error } = await supabase
      .from('staff_data_imports')
      .select('*, profiles:staff_user_id(display_name, email)')
      .eq('staff_user_id', staffUserId)
      .maybeSingle();
    if (error) throw error;
    return data as StaffDataImport | null;
  },

  async getMine(userId: string): Promise<StaffDataImport | null> {
    return this.getForStaff(userId);
  },

  async listAll(): Promise<StaffDataImport[]> {
    const { data, error } = await supabase
      .from('staff_data_imports')
      .select('*, profiles:staff_user_id(display_name, email)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as StaffDataImport[];
  },

  async upsert(staffUserId: string, rawText: string, updatedBy: string): Promise<StaffDataImport> {
    let importData: Record<string, unknown> = { raw: rawText };
    const trimmed = rawText.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        importData = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        importData = { raw: rawText, parse_error: 'Invalid JSON — stored as text' };
      }
    }

    const { data, error } = await supabase
      .from('staff_data_imports')
      .upsert(
        {
          staff_user_id: staffUserId,
          import_data: importData,
          raw_text: rawText,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'staff_user_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return data as StaffDataImport;
  },
};
