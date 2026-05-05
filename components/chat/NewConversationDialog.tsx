/**
 * NewConversationDialog — création de conversations DM ou groupe
 *
 * Architecture :
 *   - Recherche utilisateur debounced (250 ms) sur /api/users/search
 *   - Sélection multiple → groupe automatique si ≥ 2 destinataires
 *   - Création via /api/conversations puis navigation vers /conversations/:id
 *
 * UX :
 *   - Backdrop blur, animation d'entrée/sortie framer-motion
 *   - Échap pour fermer, Entrée pour valider
 *   - Indicateur de chargement, gestion d'erreurs propre
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Search,
  Users,
  X,
  Check,
  AlertCircle,
  MessageSquarePlus,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SearchedUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
}

interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (conversationId: string) => void;
}

export function NewConversationDialog({
  open,
  onClose,
  onCreated,
}: NewConversationDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [selected, setSelected] = useState<SearchedUser[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isGroup = selected.length >= 2;

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected([]);
      setGroupTitle("");
      setError(null);
      setCreating(false);
    } else {
      // Focus input on open
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced search (250ms) avec abort des requêtes en vol
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);

    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error("search-failed");
        const data = (await res.json()) as { users: SearchedUser[] };
        setResults(data.users);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Recherche impossible");
        }
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  const toggle = useCallback((user: SearchedUser) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  }, []);

  const removeSelected = useCallback((id: string) => {
    setSelected((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const visibleResults = useMemo(
    () => results.filter((u) => !selected.some((s) => s.id === u.id)),
    [results, selected],
  );

  async function handleCreate() {
    if (selected.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: selected.map((u) => u.id),
          isGroup,
          title: isGroup ? groupTitle.trim() || null : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Création impossible");
        return;
      }
      const id = data.conversation?.id;
      if (id) {
        onCreated?.(id);
        onClose();
        router.push(`/conversations/${id}`);
        router.refresh();
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          {/* Modal */}
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="new-conv-title"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed left-1/2 top-[10%] z-50 -translate-x-1/2",
              "w-[92vw] max-w-lg",
              "rounded-2xl border border-border bg-card shadow-2xl",
              "flex flex-col max-h-[80vh] overflow-hidden",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <MessageSquarePlus className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 id="new-conv-title" className="text-base font-semibold">
                    Nouvelle conversation
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {isGroup
                      ? `Groupe avec ${selected.length} personnes`
                      : "Cherchez un utilisateur par nom ou email"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Search */}
            <div className="px-5 pt-4 pb-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="alice@example.com ou @alice"
                  className="pl-9 h-10"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                )}
              </div>

              {/* Selected chips */}
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                    >
                      <Avatar className="w-5 h-5">
                        {u.avatarUrl && (
                          <AvatarImage src={u.avatarUrl} alt={u.username} />
                        )}
                        <AvatarFallback className="text-[9px]">
                          {u.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {u.username}
                      <button
                        onClick={() => removeSelected(u.id)}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                        aria-label={`Retirer ${u.username}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Group title (si ≥2 destinataires) */}
              {isGroup && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-1.5"
                >
                  <Label htmlFor="group-title" className="text-xs">
                    Nom du groupe (optionnel)
                  </Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="group-title"
                      value={groupTitle}
                      onChange={(e) => setGroupTitle(e.target.value)}
                      placeholder="Équipe design"
                      maxLength={80}
                      className="pl-9 h-10"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
              {query.trim().length === 0 ? (
                <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                  Tapez un nom pour commencer la recherche
                </div>
              ) : !searching && visibleResults.length === 0 ? (
                <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                  Aucun utilisateur trouvé
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {visibleResults.map((u) => (
                    <li key={u.id}>
                      <button
                        onClick={() => toggle(u)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg",
                          "hover:bg-accent/60 active:bg-accent transition-colors",
                          "text-left",
                        )}
                      >
                        <Avatar className="w-9 h-9">
                          {u.avatarUrl && (
                            <AvatarImage src={u.avatarUrl} alt={u.username} />
                          )}
                          <AvatarFallback className="text-xs bg-brand-gradient text-white">
                            {u.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {u.username}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.email}
                          </div>
                        </div>
                        <div className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mx-5 mb-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
              <Button variant="ghost" onClick={onClose} disabled={creating}>
                Annuler
              </Button>
              <Button
                onClick={handleCreate}
                disabled={selected.length === 0 || creating}
                className={cn(
                  "gap-1.5 bg-brand-gradient text-white border-0",
                  "hover:shadow-lg hover:shadow-primary/25",
                )}
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {isGroup ? "Créer le groupe" : "Démarrer"}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
