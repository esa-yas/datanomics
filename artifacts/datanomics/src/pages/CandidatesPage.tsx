import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { candidateService } from "@/services/candidateService";
import type { Candidate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Search, Plus, Filter, MoreHorizontal, User, Mail, Phone, Briefcase, Users } from "lucide-react";
import toast from "react-hot-toast";

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  active_search: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  interview_stage: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  offer_received: "bg-green-500/20 text-green-300 border-green-500/30",
  placed: "bg-green-600/20 text-green-400 border-green-600/30",
  paused: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  dropped: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function CandidatesPage() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workAuthFilter, setWorkAuthFilter] = useState("all");

  // Form State
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "", email: "", phone: "", work_auth: "USC", target_roles: "", skills: "", status: "lead", experience_years: "0"
  });

  const loadData = () => {
    setLoading(true);
    candidateService.getAll()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredData = data.filter(c => {
    const matchesSearch = c.full_name.toLowerCase().includes(search.toLowerCase()) || 
                          c.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesWorkAuth = workAuthFilter === "all" || c.work_auth === workAuthFilter;
    return matchesSearch && matchesStatus && matchesWorkAuth;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.email) {
      toast.error("Name and Email are required");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await candidateService.create({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        work_auth: formData.work_auth as any,
        target_roles: formData.target_roles.split(",").map(s => s.trim()).filter(Boolean),
        skills: formData.skills.split(",").map(s => s.trim()).filter(Boolean),
        status: formData.status as any,
        experience_years: parseInt(formData.experience_years, 10),
        preferred_work_modes: ['remote'],
        willing_to_relocate: false,
        country: 'USA',
        preferred_states: [],
        total_applications: 0,
        total_replies: 0,
        total_interviews: 0,
        total_offers: 0,
        tags: [],
        notes: "",
        client_portal_enabled: false
      });
      toast.success("Candidate added successfully");
      setIsSheetOpen(false);
      setFormData({ full_name: "", email: "", phone: "", work_auth: "USC", target_roles: "", skills: "", status: "lead", experience_years: "0" });
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create candidate");
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeAgo = (d: string) => { 
    const diff = Date.now() - new Date(d).getTime(); 
    if (diff < 60000) return 'just now'; 
    if (diff < 3600000) return Math.floor(diff/60000) + 'm ago'; 
    if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago'; 
    return Math.floor(diff/86400000) + 'd ago'; 
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Candidates</h1>
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button data-testid="button-add-candidate" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" /> Add Candidate
            </Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-md overflow-y-auto bg-card border-l-border">
            <SheetHeader className="mb-6">
              <SheetTitle className="text-foreground">Add New Candidate</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="full_name" className="pl-9" placeholder="John Doe" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" className="pl-9" placeholder="john@example.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="phone" className="pl-9" placeholder="+1 555-0123" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Work Auth</Label>
                  <Select value={formData.work_auth} onValueChange={v => setFormData({...formData, work_auth: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['USC', 'GC', 'H1B', 'OPT', 'CPT', 'TN', 'EAD', 'Other'].map(auth => (
                        <SelectItem key={auth} value={auth}>{auth}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(STATUS_COLORS).map(s => (
                        <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience_years">Experience (Years)</Label>
                <Input id="experience_years" type="number" min="0" value={formData.experience_years} onChange={e => setFormData({...formData, experience_years: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_roles">Target Roles (comma separated)</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="target_roles" className="pl-9" placeholder="Frontend Engineer, React Developer" value={formData.target_roles} onChange={e => setFormData({...formData, target_roles: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills (comma separated)</Label>
                <Input id="skills" placeholder="React, TypeScript, Node.js" value={formData.skills} onChange={e => setFormData({...formData, skills: e.target.value})} />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding..." : "Add Candidate"}</Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or email..." 
            className="pl-9 bg-card border-border"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-card border-border"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.keys(STATUS_COLORS).map(s => (
                <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select value={workAuthFilter} onValueChange={setWorkAuthFilter}>
            <SelectTrigger className="bg-card border-border"><SelectValue placeholder="All Work Auth" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Work Auth</SelectItem>
              {['USC', 'GC', 'H1B', 'OPT', 'CPT', 'TN', 'EAD', 'Other'].map(auth => (
                <SelectItem key={auth} value={auth}>{auth}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-md" />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          Error loading candidates: {error.message}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No candidates found</h3>
          <p className="text-muted-foreground max-w-sm mb-6">
            {search || statusFilter !== "all" || workAuthFilter !== "all" 
              ? "Try adjusting your filters to find what you're looking for."
              : "Get started by adding your first candidate to the system."}
          </p>
          {!(search || statusFilter !== "all" || workAuthFilter !== "all") && (
            <Button onClick={() => setIsSheetOpen(true)} className="bg-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" /> Add Candidate
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="bg-muted text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Work Auth</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Target Roles</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Skills</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Apps</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Updated</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((c) => (
                  <tr 
                    key={c.id} 
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => setLocation(`/candidates/${c.id}`)}
                    data-testid={`row-candidate-${c.id}`}
                  >
                    <td className="px-4 py-4">
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {c.full_name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{c.email}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase border ${STATUS_COLORS[c.status] || STATUS_COLORS.lead}`}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-secondary/10 text-secondary border border-secondary/20">
                        {c.work_auth}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs text-muted-foreground max-w-[150px] truncate" title={c.target_roles?.join(', ')}>
                        {c.target_roles?.join(', ') || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="bg-muted px-1.5 py-0.5 rounded">{c.skills?.length || 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-medium">{c.total_applications || 0}</td>
                    <td className="px-4 py-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(c.updated_at)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); }}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
