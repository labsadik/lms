import { useEffect, useState, useCallback } from "react";
import { X, Download, StickyNote, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotesProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export default function Notes({ open, onClose, url, title }: NotesProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(false);
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
      <div className="relative z-10 w-full max-w-4xl h-[88vh] sm:h-[85vh] max-h-[860px] bg-background rounded-2xl shadow-2xl border border-border/40 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-300">

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
                <p className="text-xs text-muted-foreground mt-1 max-w-[260px] leading-relaxed">
                  The PDF couldn't be embedded in the viewer. Try downloading it directly.
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