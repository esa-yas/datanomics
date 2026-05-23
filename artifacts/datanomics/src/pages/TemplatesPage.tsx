import { useState, useEffect } from "react";
import { templateService } from "@/services/templateService";
import type { Template, TemplateCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { BookOpen, Plus, Edit2, Variable } from "lucide-react";
import toast from "react-hot-toast";

const CATEGORIES: TemplateCategory[] = [
  'recruiter_reply', 'follow_up', 'interview_availability', 'salary_answer', 
  'work_auth_answer', 'relocation_answer', 'rejection_followup', 'client_update'
];

export default function TemplatesPage() {
  const [data, setData] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [activeTab, setActiveTab] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", category: "recruiter_reply", subject: "", body: "" });

  const loadData = async () => {
    setLoading(true);
    try {
      const temps = await templateService.getAll();
      setData(temps);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredData = activeTab === "all" ? data : data.filter(t => t.category === activeTab);

  const extractVariables = (text: string) => {
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.body) return toast.error("Name and Body are required");

    const vars = extractVariables(formData.body);
    
    try {
      if (editingId) {
        await templateService.update(editingId, { ...formData, category: formData.category as any, variables: vars });
        toast.success("Template updated");
      } else {
        await templateService.create({ ...formData, category: formData.category as any, variables: vars, is_global: true, usage_count: 0, created_by: 'system' });
        toast.success("Template created");
      }
      setFormOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openEdit = (t: Template) => {
    setEditingId(t.id);
    setFormData({ name: t.name, category: t.category, subject: t.subject || "", body: t.body });
    setFormOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setFormData({ name: "", category: "recruiter_reply", subject: "", body: "" });
    setFormOpen(true);
  };

  const renderBodyWithHighlight = (body: string) => {
    const parts = body.split(/(\{\{[^}]+\}\})/g);
    return parts.map((part, i) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        return <span key={i} className="text-primary font-mono font-bold bg-primary/10 px-1 rounded">{part}</span>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-foreground">Message Templates</h1>
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground" onClick={openNew}><Plus className="w-4 h-4 mr-2" /> New Template</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl bg-card border-border">
            <DialogHeader><DialogTitle>{editingId ? "Edit Template" : "Create Template"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Standard Recruiter Reply" required />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject Line (optional)</Label>
                <Input value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} placeholder="Re: Interview Request for {{candidate_name}}" />
              </div>
              <div className="space-y-2">
                <Label className="flex justify-between">
                  <span>Message Body</span>
                  <span className="text-xs text-muted-foreground font-normal">Use {"{{variable}}"} for dynamic values</span>
                </Label>
                <Textarea 
                  value={formData.body} 
                  onChange={e => setFormData({...formData, body: e.target.value})} 
                  className="h-48 font-mono text-sm leading-relaxed bg-background"
                  required 
                />
              </div>
              
              {extractVariables(formData.body).length > 0 && (
                <div className="bg-muted p-3 rounded-md border border-border">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2"><Variable className="w-3 h-3" /> Detected Variables</div>
                  <div className="flex flex-wrap gap-2">
                    {extractVariables(formData.body).map(v => (
                      <span key={v} className="px-2 py-0.5 bg-background border border-border rounded text-[10px] font-mono text-primary">{v}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4"><Button type="submit">{editingId ? "Update" : "Save"} Template</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex border-b border-border overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab("all")} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${activeTab === 'all' ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:bg-muted"}`}>All Templates</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setActiveTab(c)} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${activeTab === c ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:bg-muted"}`}>
            {c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-card animate-pulse rounded-xl border border-border" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">Error: {error.message}</div>
      ) : filteredData.length === 0 ? (
        <div className="bg-card rounded-xl border border-border py-16 text-center text-muted-foreground">
          <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p>No templates found for this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredData.map((t) => (
            <div key={t.id} className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col h-[280px] group relative overflow-hidden">
              <div className="flex justify-between items-start mb-3 shrink-0">
                <h3 className="font-bold text-foreground truncate pr-2" title={t.name}>{t.name}</h3>
                <span className="px-2 py-0.5 rounded bg-muted border border-border text-[9px] uppercase font-bold text-muted-foreground shrink-0 max-w-[100px] truncate" title={t.category.replace(/_/g, ' ')}>
                  {t.category.replace(/_/g, ' ')}
                </span>
              </div>
              
              {t.subject && <div className="text-xs font-medium mb-2 shrink-0 truncate">Subj: <span className="text-muted-foreground font-normal">{t.subject}</span></div>}
              
              <div className="text-sm text-muted-foreground flex-1 overflow-hidden relative mb-4">
                <div className="whitespace-pre-wrap leading-relaxed absolute inset-0">
                  {renderBodyWithHighlight(t.body)}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent" />
              </div>

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border shrink-0">
                <div className="text-xs text-muted-foreground font-medium">Used <span className="text-foreground">{t.usage_count}</span> times</div>
                <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="h-8 px-2 text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10">
                  <Edit2 className="w-3 h-3 mr-1.5" /> Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
