import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

export const profileService = {
  async getAll() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('display_name', { ascending: true });
    if (error) throw error;
    return data as Profile[];
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Profile;
  },

  async getEmployees() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'client')
      .eq('status', 'active')
      .order('display_name', { ascending: true });
    if (error) throw error;
    return data as Profile[];
  },

  async update(id: string, updates: Partial<Profile>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Profile;
  },

  async getNotifications(userId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },

  async markNotificationRead(id: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);
    if (error) throw error;
  },

  async getSystemSettings() {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },
};
