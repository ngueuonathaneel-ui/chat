/**
 * Composer - Zone de saisie des messages
 *
 * Fonctionnalités:
 * - Auto-resize textarea
 * - Debounce typing indicator (300ms)
 * - Voice recorder (Recorder.js)
 * - File attachment (drag & drop)
 * - Emoji picker integration
 *
 * Algorithmes:
 * - Throttle + Debounce hybride pour typing
 * - Auto-resize avec max-height
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Send, Paperclip, Mic, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTyping } from "@/hooks/useTyping";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

interface ComposerProps {
  conversationId: string;
  onSend?: (
    content: string,
    type: "TEXT" | "VOICE" | "FILE",
    options?: { fileUrl?: string },
  ) => void;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({
  conversationId,
  onSend,
  onTyping,
  disabled = false,
  placeholder = "Écrivez un message...",
}: ComposerProps) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const { sendTyping } = useTyping(conversationId, {
    debounceMs: 300,
    throttleMs: 3000,
  });

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [text]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      sendTyping();
      onTyping?.();
    },
    [sendTyping, onTyping],
  );

  const handleSend = useCallback(() => {
    if (!text.trim() || disabled || !onSend) return;

    onSend(text.trim(), "TEXT");
    setText("");

    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());

        // Upload audio file
        try {
          const formData = new FormData();
          formData.append("file", blob, `voice_${Date.now()}.webm`);
          formData.append("conversationId", conversationId);

          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadRes.ok) throw new Error("Upload failed");

          const { url } = await uploadRes.json();

          // Send voice message
          onSend?.("", "VOICE", { fileUrl: url });
        } catch (error) {
          console.error("Failed to upload voice message:", error);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
  }, []);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      try {
        const file = files[0];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("conversationId", conversationId);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) throw new Error("Upload failed");

        const { url } = await uploadRes.json();

        // Send file message
        onSend?.("", "FILE", { fileUrl: url });
      } catch (error) {
        console.error("Failed to upload file:", error);
      }
    },
    [conversationId, onSend],
  );

  const insertEmoji = useCallback((emoji: { native: string }) => {
    setText((prev) => prev + emoji.native);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  }, []);

  return (
    <div
      className={cn(
        "relative border-t border-border bg-background/95 backdrop-blur-sm",
        isDragging && "bg-accent/50 border-primary",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
          <span className="text-primary font-medium">
            Déposez les fichiers ici
          </span>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-end gap-2">
          {/* File attachment */}
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 h-10 w-10 rounded-full"
            disabled={disabled || isRecording}
          >
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </Button>

          {/* Input container */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isRecording
                  ? `Enregistrement... ${formatDuration(recordingDuration)}`
                  : placeholder
              }
              disabled={disabled || isRecording}
              rows={1}
              className={cn(
                "w-full min-h-[44px] max-h-[200px] px-4 py-2.5",
                "bg-muted rounded-2xl resize-none",
                "border-0 focus:ring-2 focus:ring-primary/30",
                "text-sm leading-relaxed",
                "placeholder:text-muted-foreground",
                "disabled:opacity-50",
              )}
            />

            {/* Emoji picker toggle */}
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={isRecording}
              className="absolute right-3 bottom-2.5 p-1 rounded hover:bg-accent transition-colors"
            >
              <Smile className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Emoji picker popover */}
            {showEmojiPicker && (
              <div className="absolute bottom-full right-0 mb-2 z-20">
                <Picker
                  data={data}
                  onEmojiSelect={insertEmoji}
                  theme="auto"
                  previewPosition="none"
                  skinTonePosition="search"
                />
              </div>
            )}
          </div>

          {/* Send / Voice button */}
          {text.trim() ? (
            <Button
              onClick={handleSend}
              disabled={disabled}
              className="flex-shrink-0 h-10 w-10 rounded-full p-0 bg-[var(--message-self)] hover:bg-[var(--message-self)]/90"
            >
              <Send
                className="w-5 h-5"
                style={{ color: "var(--message-self-text)" }}
              />
            </Button>
          ) : (
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={disabled}
              variant={isRecording ? "destructive" : "ghost"}
              className={cn(
                "flex-shrink-0 h-10 w-10 rounded-full",
                isRecording && "animate-pulse",
              )}
            >
              {isRecording ? (
                <X className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
