import { useState, useEffect } from "react";
import { templateService } from "@/services/templateService";
import type { Template } from "@/types";

export default function TemplatesPage() {
  const [data, setData] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    templateService.getAll().then(setData).catch(setError).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-foreground">Templates</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          Error: {error.message}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((t) => (
            <div key={t.id} className="bg-card border border-border rounded-lg p-5 card-hover flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-foreground">{t.name}</h3>
                <span className="text-xs px-2 py-1 bg-muted border border-border rounded-md uppercase tracking-wider">{t.category}</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">{t.body}</p>
              <div className="text-xs text-muted-foreground">Used {t.usage_count} times</div>
            </div>
          ))}
          {data.length === 0 && <div className="text-muted-foreground">No templates found.</div>}
        </div>
      )}
    </div>
  );
}
