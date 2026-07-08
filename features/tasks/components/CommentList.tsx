"use client";

import { useState, useEffect, useRef } from "react";
import { taskService } from "../services/taskService";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useOrgMembers } from "@/lib/useOrgMembers";
import { notificationService } from "@/features/notifications/services/notificationService";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { Loader2, Trash2, Send } from "lucide-react";

interface Props {
  taskId: string;
  taskTitle?: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

/** Highlight @mentions of known members within a plain-text segment. */
function highlightMentions(text: string, names: string[], keyPrefix: string): React.ReactNode[] {
  if (names.length === 0) return [text];
  const sorted = [...names].sort((a, b) => b.length - a.length); // "Ana Paula" before "Ana"
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(${escaped.join("|")})`, "g");
  const out: React.ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={`${keyPrefix}m${i++}`} className="text-brand-teal font-medium">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Render comment text with clickable URLs and highlighted @mentions. */
function renderContent(content: string, names: string[]) {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  const out: React.ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = urlRe.exec(content)) !== null) {
    if (m.index > last) out.push(...highlightMentions(content.slice(last, m.index), names, `t${i}`));
    const url = m[0];
    out.push(
      <a key={`u${i++}`} href={url} target="_blank" rel="noopener noreferrer" className="text-brand-teal underline break-all" onClick={(e) => e.stopPropagation()}>
        {url}
      </a>
    );
    last = m.index + url.length;
  }
  if (last < content.length) out.push(...highlightMentions(content.slice(last), names, `t${i}`));
  return out;
}

export function CommentList({ taskId, taskTitle }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuthStore();
  const members = useOrgMembers();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const myName = members.find((m) => m.id === user?.id)?.full_name ?? "Alguém";
  const memberNames = members.map((m) => m.full_name);

  const authorOf = (userId: string) => {
    const m = members.find((x) => x.id === userId);
    return { name: m?.full_name ?? "Usuário", avatar_url: m?.avatar_url ?? null };
  };

  useEffect(() => {
    setLoading(true);
    taskService.getComments(taskId).then((data) => {
      setComments(data as Comment[]);
      setLoading(false);
    });
  }, [taskId]);

  // Detect an "@query" token immediately before the caret to drive the picker.
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setNewComment(value);
    const caret = e.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|\s)@(\S*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  }

  function insertMention(fullName: string) {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? newComment.length;
    const before = newComment.slice(0, caret);
    const after = newComment.slice(caret);
    const replaced = before.replace(/@(\S*)$/, `@${fullName} `);
    const next = replaced + after;
    setNewComment(next);
    setMentionQuery(null);
    // Restore focus + caret after the inserted mention
    requestAnimationFrame(() => {
      el?.focus();
      const pos = replaced.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  const mentionMatches =
    mentionQuery === null
      ? []
      : members
          .filter((m) => m.id !== user?.id && m.full_name.toLowerCase().includes(mentionQuery))
          .slice(0, 6);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !user) return;
    setSubmitting(true);
    const content = newComment.trim();

    // Optimistic insert
    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      content,
      created_at: new Date().toISOString(),
      user_id: user.id,
      profiles: { full_name: null, avatar_url: null },
    };
    setComments((prev) => [...prev, optimistic]);
    setNewComment("");
    setMentionQuery(null);

    try {
      const saved = await taskService.addComment(taskId, user.id, content);
      setComments((prev) =>
        prev.map((c) => (c.id === optimistic.id ? (saved as Comment) : c))
      );
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });

      // Notify every mentioned member (skip self), once each.
      const mentioned = members.filter(
        (m) => m.id !== user.id && content.includes(`@${m.full_name}`)
      );
      await Promise.all(
        mentioned.map((m) =>
          notificationService.create({
            userId: m.id,
            type: "mention",
            taskId,
            fromUserId: user.id,
            content: `${myName} mencionou você em ${taskTitle ? `"${taskTitle}"` : "um comentário"}: "${content.slice(0, 80)}"`,
          })
        )
      );
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId)); // optimistic
    await taskService.deleteComment(commentId).catch(() => {
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
          {comments.map((comment) => {
            const author = authorOf(comment.user_id);
            return (
            <div key={comment.id} className="flex gap-2.5 group">
              <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                <AvatarImage src={author.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px] bg-brand-navy/10 text-brand-navy">
                  {getInitials(author.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-brand-navy">
                    {author.name}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {timeAgo(comment.created_at)}
                  </span>
                </div>
                <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap">
                  {renderContent(comment.content, memberNames)}
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
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="flex gap-2 items-end relative">
        {/* @mention picker */}
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-64 bg-white rounded-xl border border-neutral-200 shadow-xl z-20 py-1 max-h-56 overflow-y-auto">
            {mentionMatches.map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.full_name); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-neutral-50 transition-colors"
              >
                <Avatar className="w-5 h-5 shrink-0">
                  <AvatarImage src={m.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[8px] bg-brand-navy/10 text-brand-navy">
                    {getInitials(m.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{m.full_name}</span>
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={textareaRef}
          value={newComment}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mentionQuery !== null) { setMentionQuery(null); return; }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e);
          }}
          placeholder="Escrever comentário... (@ para mencionar, Ctrl+Enter para enviar)"
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
