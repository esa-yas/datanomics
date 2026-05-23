import { useState, useEffect } from "react";
import { profileService } from "@/services/profileService";
import { supabase } from "@/lib/supabase";
import type { SystemSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Settings, Save, Bot, Gauge, FileText } from "lucide-react";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    profileService.getSystemSettings()
      .then(setSettings)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const { error: updErr } = await supabase.from('system_settings').update(settings).eq('id', settings.id);
      if (updErr) throw updErr;
      toast.success("Settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-3xl space-y-6"><div className="h-96 bg-card border border-border rounded-xl animate-pulse" /></div>;
  }

  if (error || !settings) {
    return <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">Error: {error?.message || "Failed to load"}</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" /> System Settings
        </h1>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* AI Config */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border bg-background/50 flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">AI Configuration</h2>
          </div>
          <div className="p-6">
            <Label className="text-sm font-medium mb-3 block">Active AI Provider</Label>
            <div className="flex gap-3">
              <button 
                type="button"
                className={`px-6 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-all border ${settings.active_ai_provider === 'gemini' ? 'bg-primary/20 text-primary border-primary shadow-sm' : 'bg-background border-border text-muted-foreground hover:bg-muted'}`}
                onClick={() => setSettings({...settings, active_ai_provider: 'gemini'})}
              >
                Google Gemini
              </button>
              <button type="button" className="px-6 py-2.5 rounded-lg text-sm font-bold tracking-wide border bg-muted/50 border-border text-muted-foreground/50 cursor-not-allowed">
                OpenAI (Coming Soon)
              </button>
              <button type="button" className="px-6 py-2.5 rounded-lg text-sm font-bold tracking-wide border bg-muted/50 border-border text-muted-foreground/50 cursor-not-allowed">
                Anthropic (Coming Soon)
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Currently only Gemini 1.5 Pro is fully integrated for resume tailoring and message generation.</p>
          </div>
        </div>

        {/* Operations */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border bg-background/50 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Operations Parameters</h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Daily App Target per Candidate</Label>
              <Input 
                type="number" 
                min="0" 
                value={settings.daily_application_target} 
                onChange={e => setSettings({...settings, daily_application_target: parseInt(e.target.value) || 0})}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label>Weekly App Target per Candidate</Label>
              <Input 
                type="number" 
                min="0" 
                value={settings.weekly_application_target} 
                onChange={e => setSettings({...settings, weekly_application_target: parseInt(e.target.value) || 0})}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label>Reply SLA (Hours)</Label>
              <Input 
                type="number" 
                min="1" 
                value={settings.reply_sla_hours} 
                onChange={e => setSettings({...settings, reply_sla_hours: parseInt(e.target.value) || 1})}
                className="bg-background"
              />
              <p className="text-[10px] text-muted-foreground">Messages older than this will be flagged as "action needed".</p>
            </div>
            <div className="space-y-2">
              <Label>Quality Score Threshold</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={settings.quality_score_threshold} 
                  onChange={e => setSettings({...settings, quality_score_threshold: parseInt(e.target.value) || 0})}
                  className="bg-background w-24"
                />
                <span className="text-sm font-bold">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reports */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border bg-background/50 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Weekly Reporting</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Auto-send Weekly Reports</Label>
                <p className="text-sm text-muted-foreground">Automatically email weekly reports to active clients.</p>
              </div>
              <Switch 
                checked={settings.weekly_report_auto_send} 
                onCheckedChange={c => setSettings({...settings, weekly_report_auto_send: c})} 
              />
            </div>
            
            {settings.weekly_report_auto_send && (
              <div className="space-y-2 animate-in fade-in">
                <Label>Day of Week to Send</Label>
                <div className="w-64">
                  <Select 
                    value={settings.weekly_report_day_of_week.toString()} 
                    onValueChange={v => setSettings({...settings, weekly_report_day_of_week: parseInt(v)})}
                  >
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                      <SelectItem value="0">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={saving} className="bg-primary text-primary-foreground font-bold tracking-wide w-full sm:w-auto px-12 shadow-md">
            {saving ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Settings</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
