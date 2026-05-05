"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageSquarePlus, Lock, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { cn } from "@/lib/utils";

const HIGHLIGHTS = [
  {
    icon: Lock,
    title: "Chiffré E2E",
    desc: "Personne ne peut lire vos messages, pas même nous.",
  },
  {
    icon: Sparkles,
    title: "Résumés IA",
    desc: "Rattrapez les conversations longues en un clin d’œil.",
  },
  {
    icon: Users,
    title: "Groupes",
    desc: "Créez des espaces de discussion sécurisés.",
  },
];

export function EmptyConversations() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex-1 flex items-center justify-center p-6 lg:p-12 mesh-gradient relative overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-30" />

      <NewConversationDialog open={open} onClose={() => setOpen(false)} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative max-w-xl w-full text-center space-y-10"
      >
        {/* Icon */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-3xl bg-brand-gradient blur-2xl opacity-40 animate-float" />
          <div className="relative w-24 h-24 rounded-3xl bg-brand-gradient flex items-center justify-center shadow-xl">
            <MessageSquarePlus
              className="w-10 h-10 text-white"
              strokeWidth={2}
            />
            <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/20" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight">
            Lancez votre première{" "}
            <span className="text-brand-gradient">conversation</span>
          </h2>
          <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
            Aucune conversation pour l&apos;instant. Invitez quelqu&apos;un et
            commencez à discuter en toute confidentialité.
          </p>
        </div>

        {/* CTA */}
        <div className="flex items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={() => setOpen(true)}
            className={cn(
              "gap-2 h-12 px-6 font-medium",
              "bg-brand-gradient text-white border-0",
              "hover:shadow-lg hover:shadow-primary/25 transition-all duration-300",
            )}
          >
            <MessageSquarePlus className="w-4 h-4" />
            Nouvelle conversation
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setOpen(true)}
            className="h-12 px-6 font-medium"
          >
            Inviter un ami
          </Button>
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-border/40">
          {HIGHLIGHTS.map((h, i) => (
            <motion.div
              key={h.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
              className="space-y-2 p-4 rounded-xl bg-card/40 backdrop-blur-sm border border-border/40"
            >
              <div className="w-8 h-8 mx-auto rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <h.icon className="w-4 h-4" strokeWidth={2.2} />
              </div>
              <div className="text-sm font-medium">{h.title}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {h.desc}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
