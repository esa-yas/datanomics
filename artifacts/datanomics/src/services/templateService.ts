import { supabase } from '../lib/supabase';
import type { Template, TemplateCategory } from '../types';

export const templateService = {
  async getAll() {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('usage_count', { ascending: false });
    if (error) throw error;
    return data as Template[];
  },

  async getByCategory(category: TemplateCategory) {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('category', category)
      .order('usage_count', { ascending: false });
    if (error) throw error;
    return data as Template[];
  },

  async create(template: Partial<Template>) {
    const { data, error } = await supabase
      .from('templates')
      .insert(template)
      .select()
      .single();
    if (error) throw error;
    return data as Template;
  },

  async update(id: string, updates: Partial<Template>) {
    const { error } = await supabase
      .from('templates')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  async incrementUsage(id: string) {
    const { error } = await supabase.rpc('increment_template_usage', { template_id: id });
    if (error) {
      await supabase.from('templates').update({ usage_count: (await supabase.from('templates').select('usage_count').eq('id', id).single()).data?.usage_count + 1 }).eq('id', id);
    }
  },

  applyTemplate(template: Template, variables: Record<string, string>): string {
    let body = template.body;
    let subject = template.subject ?? '';
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      body = body.replace(regex, value);
      subject = subject.replace(regex, value);
    }
    return body;
  },
};
