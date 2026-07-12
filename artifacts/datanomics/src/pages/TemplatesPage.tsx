import { useState } from "react";
import toast from "react-hot-toast";
import { templateService } from "@/services/templateService";
import { useTemplates, useCandidatesPicklist, useInvalidateData } from "@/hooks/useData";
import { useDataReady } from "@/hooks/useDataReady";
import { QueryError, FetchingHint, ListSkeleton } from "@/components/ui/QueryState";
import { AIConversationReplyWriter } from "@/components/messages/AIConversationReplyWriter";
import { useAuthStore } from "@/stores/authStore";
import { canCreateTemplates } from "@/lib/permissions";
import type { Template, TemplateCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { BookOpen, Plus, Edit2, Variable, Sparkles } from "lucide-react";
import { detectBracketPlaceholders } from "@/lib/ai/templatePlaceholders";

const CATEGORIES: TemplateCategory[] = [
  'recruiter_reply', 'follow_up', 'interview_availability', 'salary_answer',
  'work_auth_answer', 'relocation_answer', 'rejection_followup', 'client_update'
];

export default function TemplatesPage() {
  const { user } = useAuthStore();
  const invalidate = useInvalidateData();
  const ready = useDataReady();
  const { data, isPending, isError, error, isFetching, refetch, isFetched } = useTemplates();
  const templates = data ?? [];
  const { data: candidates = [] } = useCandidatesPicklist();
  const allowTemplateCrud = canCreateTemplates(user?.role);

  const [pageSection, setPageSection] = useState<"writer" | "library">("writer");
  const [activeTab, setActiveTab] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", category: "recruiter_reply", subject: "", body: "" });

  const filteredData = activeTab === "all" ? templates : templates.filter(t => t.category === activeTab);

  const extractVariables = (text: string, subject = "") => {
    const bracket = detectBracketPlaceholders(subject, text);
    const curly = (text.match(/\{\{([^}]+)\}\}/g) || []).map(m => m.replace(/[{}]/g, ''));
    return [...new Set([...bracket, ...curly])];
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.body) { toast.error("Name and Body are required"); return; }

    const vars = extractVariables(formData.body, formData.subject);

    try {
      if (editingId) {
        await templateService.update(editingId, { ...formData, category: formData.category as TemplateCategory, variables: vars });
        toast.success("Template updated");
      } else {
        await templateService.create({ ...formData, category: formData.category as TemplateCategory, variables: vars, is_global: true, usage_count: 0, created_by: 'system' });
        toast.success("Template created");
      }
      setFormOpen(false);
      invalidate.templates();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
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
    const parts = body.split(/(\{\{[^}]+\}\}|\[[^\]]+\])/g);
    return parts.map((part, i) => {
      if ((part.startsWith('{{') && part.endsWith('}}')) || (part.startsWith('[') && part.endsWith(']'))) {
        return <span key={i} className="text-primary font-mono font-bold bg-primary/10 px-1 rounded">{part}</span>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Message Templates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Draft replies from a pasted conversation, or use pre-built templates from the library
          </p>
        </div>
        {pageSection === 'library' && allowTemplateCrud && (
          <Dialog open={formOpen} onOpenChange={setFormOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground" onClick={openNew}>
                <Plus className="w-4 h-4 mr-2" /> New Template
              </Button>
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
                    className="h-48 font-mono text-sm leading-relaxed bg-background whitespace-pre-wrap"
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
        )}
      </div>

      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        <button
          type="button"
          onClick={() => setPageSection("writer")}
          className={`px-5 py-2.5 text-sm font-medium flex items-center gap-2 ${pageSection === 'writer' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
        >
          <Sparkles className="w-4 h-4" /> AI Reply Writer
        </button>
        <button
          type="button"
          onClick={() => setPageSection("library")}
          className={`px-5 py-2.5 text-sm font-medium flex items-center gap-2 ${pageSection === 'library' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
        >
          <BookOpen className="w-4 h-4" /> Template Library
        </button>
      </div>

      {pageSection === 'writer' ? (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <AIConversationReplyWriter candidates={candidates} />
        </div>
      ) : (
        <>
          <div className="flex border-b border-border overflow-x-auto no-scrollbar">
            <button onClick={() => setActiveTab("all")} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${activeTab === 'all' ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:bg-muted"}`}>All Templates</button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setActiveTab(c)} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${activeTab === c ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:bg-muted"}`}>
                {c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <FetchingHint show={ready && isFetching && isFetched} />

          {!ready || isPending ? (
            <ListSkeleton rows={3} />
          ) : isError ? (
            <QueryError error={error} onRetry={() => refetch()} label="Failed to load templates" />
          ) : filteredData.length === 0 ? (
            <div className="bg-card rounded-xl border border-border py-16 text-center text-muted-foreground">
              <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p>No templates in the library yet.</p>
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
                    {allowTemplateCrud && (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="h-8 px-2 text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10">
                        <Edit2 className="w-3 h-3 mr-1.5" /> Edit
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
