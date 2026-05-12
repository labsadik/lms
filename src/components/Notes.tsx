import { useEffect, useState, useCallback } from "react";
import { X, Download, StickyNote, FileText, Loader2, PencilLine, MonitorSmartphone, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NotesProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export default function Notes({ open, onClose, url, title }: NotesProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tipExpanded, setTipExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(false);
      setTipExpanded(false);
    }
  }, [open]);

  /* Lock body scroll */
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = url;
    a.download = title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_") + ".pdf";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [url, title]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl h-[90vh] sm:h-[88vh] max-h-[900px] bg-background rounded-2xl shadow-2xl border border-border/40 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-300">

        {/* ── Header ── */}
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-border/40 bg-card">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <StickyNote className="w-[18px] h-[18px] text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-foreground truncate leading-snug">{title}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Lecture Notes</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="h-8 gap-1.5 text-xs font-medium rounded-lg px-2.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-lg"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Productivity Tip Banner ── */}
        <div className="shrink-0 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/[0.06] via-amber-500/[0.03] to-transparent">
          <button
            onClick={() => setTipExpanded((v) => !v)}
            className="w-full flex items-center gap-3 px-4 sm:px-5 py-2.5 text-left transition-colors hover:from-amber-500/[0.08]"
          >
            <div className="shrink-0 w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="flex-1 text-[11px] sm:text-xs font-semibold text-amber-700 dark:text-amber-400 leading-snug">
              Make notes during the lecture for consistency & higher productivity
            </p>
            {tipExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-amber-500/50 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-amber-500/50 shrink-0" />
            )}
          </button>

          {tipExpanded && (
            <div className="px-4 sm:px-5 pb-3 space-y-2.5 animate-in slide-in-from-top-1 duration-200">
              {/* Tip 1 */}
              <div className="flex gap-2.5 p-2.5 rounded-lg bg-amber-500/[0.05] border border-amber-500/15">
                <div className="shrink-0 w-8 h-8 rounded-md bg-amber-500/10 flex items-center justify-center">
                  <PencilLine className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs font-bold text-foreground leading-snug">Write Along While Watching</p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    During the live or recorded lecture, actively make notes alongside. This builds consistency, improves retention, and boosts your overall productivity.
                  </p>
                </div>
              </div>

              {/* Tip 2 */}
              <div className="flex gap-2.5 p-2.5 rounded-lg bg-blue-500/[0.05] border border-blue-500/15">
                <div className="shrink-0 w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <MonitorSmartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs font-bold text-foreground leading-snug">Use the App First, Website as Fallback</p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    Always prefer viewing and downloading notes from within the app. Only go to the website if the download fails here. Your focus should be on productivity, not switching platforms.
                  </p>
                </div>
              </div>

              {/* Bottom emphasis */}
              <p className="text-[10px] text-amber-600/60 dark:text-amber-500/50 font-semibold text-center pt-0.5 leading-relaxed">
                Consistency in note-taking directly reflects in your scores. Take it seriously.
              </p>
            </div>
          )}
        </div>

        {/* ── PDF Body ── */}
        <div className="flex-1 min-h-0 relative bg-neutral-100 dark:bg-neutral-900">
          {/* Loading overlay */}
          {loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 z-10 bg-neutral-100 dark:bg-neutral-900">
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">Loading notes…</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-neutral-100 dark:bg-neutral-900">
              <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center">
                <FileText className="w-6 h-6 text-muted-foreground/30" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-foreground">Unable to preview</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-[280px] leading-relaxed">
                  The PDF couldn't be embedded in the app viewer. Download it directly or visit the website to access it.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="mt-1 h-9 gap-1.5 text-xs font-medium rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </Button>
            </div>
          )}

          {/* PDF iframe */}
          {!error && (
            <iframe
              src={url}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              className="w-full h-full border-0"
              title={title}
            />
          )}
        </div>
      </div>
    </div>
  );
}