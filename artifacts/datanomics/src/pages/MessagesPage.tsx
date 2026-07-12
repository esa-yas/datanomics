import { useState, useEffect } from "react";
import { Link } from "wouter";
import { recruiterMessageService } from "@/services/recruiterMessageService";
import { useMessages, useCandidatesPicklist, useInvalidateData } from "@/hooks/useData";
import { useDataReady } from "@/hooks/useDataReady";
import { QueryError, FetchingHint } from "@/components/ui/QueryState";
import type { RecruiterMessage } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Mail, Linkedin, Phone, Send, Inbox, CheckCircle2, Clock, ArrowRight, Sparkles, PenLine } from "lucide-react";
import toast from "react-hot-toast";

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  linkedin: <Linkedin className="w-4 h-4" />,
  phone: <Phone className="w-4 h-4" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-destructive",
  normal: "bg-blue-500",
  low: "bg-gray-500",
};

export default function MessagesPage() {
  const invalidate = useInvalidateData();
  const ready = useDataReady();
  const { data, isPending, isError, error, isFetching, refetch, isFetched } = useMessages();
  const messages = data ?? [];
  const { data: candidates = [] } = useCandidatesPicklist();

  const [activeTab, setActiveTab] = useState("all");
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState({ candidate_id: "", subject: "", body: "", channel: "email", priority: "normal" });
  const [replyText, setReplyText] = useState("");

  const filteredMsgs = messages.filter(m => {
    if (activeTab === "unread") return m.status === "unread";
    if (activeTab === "action_needed") return m.status === "action_needed" || (m.status === "unread" && m.direction === "inbound");
    if (activeTab === "replied") return m.status === "replied";
    return true;
  });

  const selectedMsg = messages.find(m => m.id === selectedMsgId);
  const selectedCandidate = selectedMsg ? candidates.find(c => c.id === selectedMsg.candidate_id) : null;

  useEffect(() => {
    if (selectedMsg && selectedMsg.status === 'unread') {
      recruiterMessageService.markRead(selectedMsg.id).then(() => {
        invalidate.messages();
      });
    }
  }, [selectedMsgId, selectedMsg?.id, selectedMsg?.status]);

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logForm.candidate_id || !logForm.body) { toast.error("Candidate and Body are required"); return; }

    try {
      await recruiterMessageService.create({
        ...logForm,
        direction: 'inbound',
        status: 'unread',
        assigned_to: 'system',
        received_at: new Date().toISOString()
      } as Partial<RecruiterMessage>);
      toast.success("Message logged");
      setLogOpen(false);
      setLogForm({ candidate_id: "", subject: "", body: "", channel: "email", priority: "normal" });
      invalidate.messages();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Log failed");
    }
  };

  const handleMarkReplied = async () => {
    if (!selectedMsg) return;
    try {
      await recruiterMessageService.markReplied(selectedMsg.id, "system", replyText);
      invalidate.messages();
      toast.success("Marked as replied");
      setReplyText("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
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
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col pb-6">
      <div className="flex justify-between items-center shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Recruiter messages — draft replies in Templates</p>
        </div>
        <div className="flex gap-2">
          <Link href="/templates">
            <Button variant="outline" className="border-primary/40 text-primary">
              <Sparkles className="w-4 h-4 mr-2" /> AI Template Generator
            </Button>
          </Link>
          <Dialog open={logOpen} onOpenChange={setLogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><Inbox className="w-4 h-4 mr-2" /> Log Message</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader><DialogTitle>Log Inbound Message</DialogTitle></DialogHeader>
              <form onSubmit={handleLogSubmit} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Candidate</Label>
                  <Select value={logForm.candidate_id} onValueChange={v => setLogForm({...logForm, candidate_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Select candidate..." /></SelectTrigger>
                    <SelectContent>{candidates.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input value={logForm.subject} onChange={e => setLogForm({...logForm, subject: e.target.value})} placeholder="Interview request..." />
                </div>
                <div className="space-y-2">
                  <Label>Message Body</Label>
                  <Textarea value={logForm.body} onChange={e => setLogForm({...logForm, body: e.target.value})} className="h-24" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={logForm.channel} onValueChange={v => setLogForm({...logForm, channel: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="phone">Phone / SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={logForm.priority} onValueChange={v => setLogForm({...logForm, priority: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end pt-4"><Button type="submit">Log Message</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <FetchingHint show={ready && isFetching && isFetched} />

      {!ready || isPending ? (
        <div className="flex-1 bg-card border border-border animate-pulse rounded-xl min-h-[400px]" />
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} label="Failed to load messages" />
      ) : (
        <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
          <div className="w-full md:w-[380px] shrink-0 bg-card border border-border rounded-xl flex flex-col overflow-hidden shadow-sm">
            <div className="flex border-b border-border overflow-x-auto no-scrollbar shrink-0">
              {['all', 'unread', 'action_needed', 'replied'].map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex-1 text-center ${
                    activeTab === t ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {filteredMsgs.map(m => {
                const candName = candidates.find(c => c.id === m.candidate_id)?.full_name || "Unknown";
                const isSelected = selectedMsgId === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => { setSelectedMsgId(m.id); setReplyText(m.ai_reply || ""); }}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-muted/80 border-primary/50 shadow-sm border-l-4 border-l-primary'
                        : 'bg-transparent border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_COLORS[m.priority]}`} />
                        <span className="font-semibold text-sm truncate text-foreground">{candName}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{timeAgo(m.received_at)}</span>
                    </div>
                    <div className="text-xs font-medium text-foreground mb-1 truncate">{m.subject || "No Subject"}</div>
                    <div className="text-xs text-muted-foreground truncate opacity-80">{m.body}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-muted-foreground opacity-70">{CHANNEL_ICONS[m.channel]}</span>
                      {m.status === 'unread' && <span className="px-1.5 py-0.5 rounded-[4px] bg-primary/20 text-primary text-[9px] font-bold uppercase">Unread</span>}
                      {m.status === 'replied' && <span className="px-1.5 py-0.5 rounded-[4px] bg-green-500/20 text-green-400 text-[9px] font-bold uppercase">Replied</span>}
                    </div>
                  </div>
                );
              })}
              {filteredMsgs.length === 0 && <div className="text-center p-8 text-muted-foreground text-sm">No messages found.</div>}
            </div>
          </div>

          <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
            {!selectedMsg ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <Mail className="w-12 h-12 mb-4 opacity-20" />
                <p>Select a message to view details</p>
                <Link href="/templates">
                  <Button variant="link" className="mt-2"><PenLine className="w-4 h-4 mr-1" /> Open AI Reply Writer</Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="p-6 border-b border-border shrink-0 bg-background/50">
                  <div className="flex justify-between items-start mb-4 gap-4">
                    <div>
                      <h2 className="text-xl font-display font-bold text-foreground mb-1">{selectedCandidate?.full_name || "Unknown Candidate"}</h2>
                      <div className="text-sm text-muted-foreground font-medium">{selectedMsg.subject || "No Subject"}</div>
                    </div>
                    <div className="flex gap-2 text-xs shrink-0">
                      <Link href="/templates">
                        <Button size="sm" variant="outline">
                          <PenLine className="w-3.5 h-3.5 mr-1" /> Draft reply
                        </Button>
                      </Link>
                      <span className={`px-2 py-1 rounded-md border flex items-center gap-1.5 capitalize font-medium ${selectedMsg.direction === 'inbound' ? 'bg-secondary/10 text-secondary border-secondary/20' : 'bg-muted text-muted-foreground border-border'}`}>
                        {selectedMsg.direction === 'inbound' ? <ArrowRight className="w-3 h-3 rotate-90" /> : <ArrowRight className="w-3 h-3 -rotate-90" />}
                        {selectedMsg.direction}
                      </span>
                      <span className="px-2 py-1 rounded-md bg-muted border border-border text-foreground flex items-center gap-1.5 capitalize font-medium">
                        {CHANNEL_ICONS[selectedMsg.channel]} {selectedMsg.channel}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <Clock className="w-3 h-3" /> Received: {new Date(selectedMsg.received_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="bg-background border border-border rounded-lg p-5 text-sm leading-relaxed whitespace-pre-wrap text-foreground shadow-sm">
                    {selectedMsg.body}
                  </div>

                  {selectedMsg.ai_reply && selectedMsg.status !== 'replied' && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 relative">
                      <div className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 bg-primary text-primary-foreground px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center shadow-sm">
                        <Sparkles className="w-3 h-3 mr-1" /> AI Draft
                      </div>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed mt-2">{selectedMsg.ai_reply}</div>
                    </div>
                  )}

                  {selectedMsg.status === 'replied' && selectedMsg.actual_reply && (
                    <div className="bg-muted border border-border rounded-lg p-5">
                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> Reply Sent
                      </div>
                      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{selectedMsg.actual_reply}</div>
                    </div>
                  )}

                  {selectedMsg.direction === 'inbound' && selectedMsg.status !== 'replied' && (
                    <div className="mt-4 space-y-3">
                      <Label className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Your reply</Label>
                      <Textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        className="min-h-[150px] bg-background font-body text-sm whitespace-pre-wrap leading-relaxed"
                        placeholder="Paste your sent reply, or draft in Templates → AI Reply Writer"
                      />
                      <div className="flex justify-between items-center">
                        <Link href="/templates">
                          <Button variant="outline" size="sm" className="border-primary/40 text-primary">
                            <Sparkles className="w-4 h-4 mr-2" /> Generate in Templates
                          </Button>
                        </Link>
                        <Button onClick={handleMarkReplied} disabled={!replyText.trim()} className="bg-primary text-primary-foreground">
                          <Send className="w-4 h-4 mr-2" /> Mark as Sent
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
