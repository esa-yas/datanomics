import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { isTableMissingError } from "@/lib/dbError";
import { AlertTriangle, ChevronDown, ChevronUp, Copy, CheckCheck, X } from "lucide-react";

const SETUP_SQL_URL = "https://supabase.com/dashboard/project/_/sql/new";

const QUICK_SQL = `-- Run this full block in your Supabase SQL Editor
-- (see the SQL provided by the agent in the chat)`;

export default function SetupBanner() {
  const [missing, setMissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const key = "dn_setup_ok";
    if (sessionStorage.getItem(key)) return;

    supabase
      .from("candidates")
      .select("id")
      .limit(1)
      .then(({ error }) => {
        if (error && isTableMissingError(error)) {
          setMissing(true);
        } else {
          sessionStorage.setItem(key, "1");
        }
      });
  }, []);

  if (!missing || dismissed) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(QUICK_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="border-b border-yellow-500/30 bg-yellow-500/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 py-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-yellow-300">
                  Database setup required
                </p>
                <p className="text-xs text-yellow-400/80 mt-0.5">
                  The app's database tables haven't been created yet. Run the setup SQL in your{" "}
                  <a
                    href={SETUP_SQL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-yellow-300"
                  >
                    Supabase SQL Editor
                  </a>
                  {" "}to enable full functionality.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setExpanded((e) => !e)}
                  className="text-xs flex items-center gap-1 text-yellow-300 hover:text-yellow-200 transition-colors"
                >
                  {expanded ? (
                    <><ChevronUp className="h-3.5 w-3.5" /> Hide SQL</>
                  ) : (
                    <><ChevronDown className="h-3.5 w-3.5" /> View SQL</>
                  )}
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="p-1 text-yellow-500/60 hover:text-yellow-300 transition-colors"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {expanded && (
              <div className="mt-3 rounded-lg border border-yellow-500/20 bg-background overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-yellow-500/20">
                  <span className="text-xs text-muted-foreground font-mono">Setup SQL — paste into Supabase SQL Editor</span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-yellow-300 hover:text-yellow-200 transition-colors"
                  >
                    {copied ? (
                      <><CheckCheck className="h-3.5 w-3.5" /> Copied!</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </button>
                </div>
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  Scroll up in this chat to find the full SQL block that starts with{" "}
                  <code className="bg-muted px-1 rounded text-yellow-300">-- ENUMS (skip if already created)</code>.
                  Copy and paste the entire block into your{" "}
                  <a
                    href={SETUP_SQL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-yellow-300 hover:text-yellow-200"
                  >
                    Supabase SQL Editor
                  </a>
                  {" "}and click Run. All tables, RLS policies, and triggers will be created automatically.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
