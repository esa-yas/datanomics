import { useState, useEffect } from "react";
import { recruiterMessageService } from "@/services/recruiterMessageService";
import type { RecruiterMessage } from "@/types";

export default function MessagesPage() {
  const [data, setData] = useState<RecruiterMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    recruiterMessageService.getAll().then(setData).catch(setError).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <h1 className="text-2xl font-display font-bold text-foreground">Messages</h1>
      </div>

      {loading ? (
        <div className="flex-1 bg-muted animate-pulse rounded-lg" />
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          Error: {error.message}
        </div>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0">
          <div className="w-1/3 bg-card border border-border rounded-lg flex flex-col overflow-hidden">
            <div className="p-3 border-b border-border bg-muted/30 font-medium">Inbox</div>
            <div className="overflow-y-auto flex-1 p-2 space-y-2">
              {data.map(m => (
                <div key={m.id} className="p-3 rounded-md bg-muted hover:bg-muted/80 cursor-pointer border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    {m.status === 'unread' && <div className="w-2 h-2 rounded-full bg-primary" />}
                    <span className="font-semibold text-sm truncate">{m.subject || "No Subject"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.body}</div>
                </div>
              ))}
              {data.length === 0 && <div className="text-center p-4 text-muted-foreground text-sm">No messages.</div>}
            </div>
          </div>
          <div className="flex-1 bg-card border border-border rounded-lg flex items-center justify-center text-muted-foreground">
            Select a message to view
          </div>
        </div>
      )}
    </div>
  );
}
