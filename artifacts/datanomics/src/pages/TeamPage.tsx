import { useState, useEffect } from "react";
import { friendlyError } from "@/lib/dbError";
import { profileService } from "@/services/profileService";
import { createUser } from "@/lib/auth";
import type { Profile, UserRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, Plus, Shield, User as UserIcon } from "lucide-react";
import toast from "react-hot-toast";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-500/20 text-red-400 border-red-500/30",
  manager: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  team_lead: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  job_search_assistant: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  resume_specialist: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  email_specialist: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  client: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function TeamPage() {
  const [data, setData] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: "", password: "", displayName: "", role: "job_search_assistant" as UserRole, phoneNumber: ""
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const emps = await profileService.getEmployees();
      setData(emps);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.displayName) {
      toast.error("Please fill all required fields"); return;
    }

    setIsSubmitting(true);
    try {
      await createUser(formData);
      toast.success("Team member added");
      setFormOpen(false);
      setFormData({ email: "", password: "", displayName: "", role: "job_search_assistant", phoneNumber: "" });
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add member");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (id: string, newRole: UserRole) => {
    try {
      await profileService.update(id, { role: newRole });
      setData(prev => prev.map(p => p.id === id ? { ...p, role: newRole } : p));
      toast.success("Role updated");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const timeAgo = (d: string) => { 
    if (!d) return "Never";
    const diff = Date.now() - new Date(d).getTime(); 
    if (diff < 60000) return 'just now'; 
    if (diff < 3600000) return Math.floor(diff/60000) + 'm ago'; 
    if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago'; 
    return Math.floor(diff/86400000) + 'd ago'; 
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-display font-bold text-foreground">Team Directory</h1>
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" /> Add Member</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Display Name *</Label>
                <Input value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Temporary Password *</Label>
                <Input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formData.role} onValueChange={(v: UserRole) => setFormData({...formData, role: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(ROLE_COLORS).map(r => (
                      <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding..." : "Add Member"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-md" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">Error: {friendlyError(error)}</div>
      ) : data.length === 0 ? (
        <div className="bg-card rounded-xl border border-border py-16 flex flex-col items-center justify-center text-center">
          <Users className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No team members found</h3>
          <p className="text-muted-foreground max-w-sm mb-6">Add a team member to start collaborating.</p>
          <Button onClick={() => setFormOpen(true)} className="bg-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" /> Add Member</Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="bg-muted text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-4 font-medium whitespace-nowrap">Member</th>
                  <th className="px-5 py-4 font-medium whitespace-nowrap">Role</th>
                  <th className="px-5 py-4 font-medium whitespace-nowrap text-center">Status</th>
                  <th className="px-5 py-4 font-medium whitespace-nowrap text-center">Target Apps/Wk</th>
                  <th className="px-5 py-4 font-medium whitespace-nowrap text-right">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-primary/30">
                          {u.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{u.display_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Select value={u.role} onValueChange={(v: UserRole) => handleRoleChange(u.id, v)}>
                        <SelectTrigger className={`h-8 w-[180px] text-xs font-bold uppercase tracking-wider border ${ROLE_COLORS[u.role] || ROLE_COLORS.client}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(ROLE_COLORS).filter(r => r !== 'client').map(r => (
                            <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${u.status === 'active' ? 'bg-green-500' : 'bg-destructive'}`} />
                        <span className="text-xs capitalize font-medium">{u.status}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center font-mono font-medium">
                      {u.weekly_target_applications || 50}
                    </td>
                    <td className="px-5 py-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(u.last_login_at || "")}
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
