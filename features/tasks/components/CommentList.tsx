"use client";

import { useState, useEffect, useRef } from "react";
import { taskService } from "../services/taskService";
import { useAuthStore } from "@/features/auth/store/authStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { Loader2, Trash2, Send } from "lucide-react";

interface Props {
  taskId: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

export function CommentList({ taskId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuthStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    taskService.getComments(taskId).then((data) => {
      setComments(data as Comment[]);
      setLoading(false);
    });
  }, [taskId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !user) return;
    setSubmitting(true);

    // Optimistic insert
    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      content: newComment.trim(),
      created_at: new Date().toISOString(),
      user_id: user.id,
      profiles: { full_name: null, avatar_url: null },
    };
    setComments((prev) => [...prev, optimistic]);
    setNewComment("");

    try {
      const saved = await taskService.addComment(taskId, user.id, optimistic.content);
      setComments((prev) =>
        prev.map((c) => (c.id === optimistic.id ? (saved as Comment) : c))
      );
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId)); // optimistic
    await taskService.deleteComment(commentId).catch(() => {
      // Reload on error
      taskService.getComments(taskId).then((data) => setComments(data as Comment[]));
    });
  }

  return (
    <div className="space-y-4">
      {/* Comment list */}
      {loading ? (
        <p className="text-xs text-neutral-400">Carregando comentários...</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {comments.length === 0 && (
            <p className="text-xs text-neutral-400">
              Sem comentários ainda. Seja o primeiro!
            </p>
          )}
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2.5 group">
              <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                <AvatarImage src={comment.profiles?.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px] bg-brand-navy/10 text-brand-navy">
                  {getInitials(comment.profiles?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-brand-navy">
                    {comment.profiles?.full_name ?? "Usuário"}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {timeAgo(comment.created_at)}
                  </span>
                </div>
                <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
              {user?.id === comment.user_id && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-neutral-300 hover:text-destructive transition-all shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e);
          }}
          placeholder="Escrever comentário... (Ctrl+Enter para enviar)"
          rows={2}
          className="flex-1 resize-none text-xs focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!newComment.trim() || submitting}
          className="bg-brand-teal hover:bg-brand-teal-dark w-8 h-8 shrink-0"
        >
          {submitting ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Send size={13} />
          )}
        </Button>
      </form>
    </div>
  );
}
