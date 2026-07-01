"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Hash, Plus, Smile, Paperclip, Reply, Pencil, Trash2, X, Check, Users2 } from "lucide-react";
import { cn, timeAgo, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/features/auth/store/authStore";

const CURRENT_USER = "Você (demo)";
const EMOJIS = ["👍", "❤️", "😄", "🎉", "🚀", "👀", "✅", "🔥"];
const PRESENCE = [
  { name: "Você (demo)", online: true },
  { name: "Ana Souza", online: true },
  { name: "Bruno Lima", online: true },
  { name: "Carla Dias", online: false },
  { name: "Diego Reis", online: false },
];
const MENTIONABLE = PRESENCE.map((p) => p.name);

interface Channel { id: string; name: string; is_default?: boolean; }
interface Post {
  id: string;
  channel: string;
  author: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  edited?: boolean;
  reactions: Record<string, string[]>; // emoji -> user names
  attachments: string[];
}

const DEFAULT_CHANNELS: Channel[] = [
  { id: "ch-geral", name: "Toda a empresa", is_default: true },
  { id: "ch-performance", name: "Performance" },
  { id: "ch-produto", name: "Produto" },
  { id: "ch-ti", name: "TI" },
];

function loadChannels(): Channel[] {
  if (typeof window === "undefined") return DEFAULT_CHANNELS;
  try { const r = localStorage.getItem("mwr_mural_channels"); if (r) return JSON.parse(r); } catch {}
  localStorage.setItem("mwr_mural_channels", JSON.stringify(DEFAULT_CHANNELS));
  return DEFAULT_CHANNELS;
}
function loadPosts(): Post[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("mwr_mural_v2") ?? "[]"); } catch { return []; }
}
function savePosts(p: Post[]) { if (typeof window !== "undefined") localStorage.setItem("mwr_mural_v2", JSON.stringify(p)); }

export default function MuralPage() {
  const { profile } = useAuthStore();
  const authorName = profile?.full_name ?? CURRENT_USER;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState("ch-geral");
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [emojiFor, setEmojiFor] = useState<string | "composer" | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [lastRead, setLastRead] = useState<Record<string, string>>({});
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setChannels(loadChannels());
    setPosts(loadPosts());
    try { setLastRead(JSON.parse(localStorage.getItem("mwr_mural_read") ?? "{}")); } catch {}
  }, []);

  // Mark channel read on open
  useEffect(() => {
    setLastRead((prev) => {
      const next = { ...prev, [activeChannel]: new Date().toISOString() };
      localStorage.setItem("mwr_mural_read", JSON.stringify(next));
      return next;
    });
  }, [activeChannel]);

  function persist(next: Post[]) { setPosts(next); savePosts(next); }

  const channelPosts = posts.filter((p) => p.channel === activeChannel);
  const topLevel = channelPosts.filter((p) => !p.parent_id);
  const repliesOf = (id: string) => channelPosts.filter((p) => p.parent_id === id);

  function unreadCount(channelId: string): number {
    const lr = lastRead[channelId];
    return posts.filter((p) => p.channel === channelId && p.author !== authorName && (!lr || p.created_at > lr)).length;
  }

  function send() {
    if (!message.trim() && attachments.length === 0) return;
    const post: Post = {
      id: Math.random().toString(36).slice(2),
      channel: activeChannel,
      author: authorName,
      content: message.trim(),
      created_at: new Date().toISOString(),
      parent_id: replyTo,
      reactions: {},
      attachments,
    };
    persist([...posts, post]);
    setMessage(""); setAttachments([]); setReplyTo(null); setMentionQuery(null);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function toggleReaction(postId: string, emoji: string) {
    persist(posts.map((p) => {
      if (p.id !== postId) return p;
      const users = p.reactions[emoji] ?? [];
      const has = users.includes(authorName);
      const nextUsers = has ? users.filter((u) => u !== authorName) : [...users, authorName];
      const reactions = { ...p.reactions };
      if (nextUsers.length === 0) delete reactions[emoji]; else reactions[emoji] = nextUsers;
      return { ...p, reactions };
    }));
    setEmojiFor(null);
  }

  function deletePost(id: string) {
    if (!confirm("Excluir esta mensagem?")) return;
    persist(posts.filter((p) => p.id !== id && p.parent_id !== id));
  }
  function saveEdit(id: string) {
    persist(posts.map((p) => (p.id === id ? { ...p, content: editText, edited: true } : p)));
    setEditing(null);
  }

  // @mention handling
  function onMessageChange(v: string) {
    setMessage(v);
    const m = v.match(/@(\w*)$/);
    setMentionQuery(m ? m[1] : null);
  }
  function applyMention(name: string) {
    setMessage((v) => v.replace(/@(\w*)$/, `@${name} `));
    setMentionQuery(null);
  }
  const mentionMatches = mentionQuery !== null
    ? MENTIONABLE.filter((n) => n.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  function createChannel() {
    const name = newChannelName.trim();
    if (!name) return;
    const ch: Channel = { id: "ch-" + Math.random().toString(36).slice(2, 7), name };
    const next = [...channels, ch];
    setChannels(next);
    localStorage.setItem("mwr_mural_channels", JSON.stringify(next));
    setNewChannelName(""); setNewChannelOpen(false);
    setActiveChannel(ch.id);
  }

  const currentChannel = channels.find((c) => c.id === activeChannel);

  // Render content with @mentions highlighted
  function renderContent(text: string) {
    return text.split(/(@[\wÀ-ú]+(?:\s[A-ZÀ-Ú][\wÀ-ú]+)?)/g).map((part, i) =>
      part.startsWith("@") && MENTIONABLE.some((n) => part.slice(1).startsWith(n.split(" ")[0]))
        ? <span key={i} className="text-brand-teal font-medium bg-brand-teal/10 rounded px-0.5">{part}</span>
        : <span key={i}>{part}</span>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Channel sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-neutral-100 bg-white">
        <div className="px-4 py-3 border-b border-neutral-50 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Mural</h2>
          <button onClick={() => setNewChannelOpen((v) => !v)} className="w-5 h-5 flex items-center justify-center rounded text-neutral-300 hover:text-brand-teal hover:bg-brand-teal/5 transition-colors">
            <Plus size={12} />
          </button>
        </div>

        {newChannelOpen && (
          <div className="px-3 py-2 border-b border-neutral-50 flex gap-1">
            <input autoFocus value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createChannel(); if (e.key === "Escape") setNewChannelOpen(false); }}
              placeholder="Nome do canal..." className="flex-1 text-xs border border-neutral-200 rounded px-2 py-1 outline-none focus:border-brand-teal" />
            <button onClick={createChannel} className="text-brand-teal"><Check size={14} /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {channels.map((ch) => {
            const unread = unreadCount(ch.id);
            return (
              <button key={ch.id} onClick={() => setActiveChannel(ch.id)}
                className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left",
                  activeChannel === ch.id ? "bg-brand-navy/5 text-brand-navy font-medium" : "text-neutral-600 hover:bg-neutral-50")}>
                <Hash size={13} className="shrink-0 text-neutral-400" />
                <span className="truncate flex-1">{ch.name}</span>
                {unread > 0 && activeChannel !== ch.id && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-brand-teal text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>
                )}
                {ch.is_default && unread === 0 && <span className="text-[9px] text-neutral-300">padrão</span>}
              </button>
            );
          })}
        </div>

        {/* Presence */}
        <div className="border-t border-neutral-100 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-2 flex items-center gap-1"><Users2 size={11} /> Membros</p>
          <div className="space-y-1.5">
            {PRESENCE.map((m) => (
              <div key={m.name} className="flex items-center gap-2">
                <span className="relative">
                  <Avatar className="w-5 h-5"><AvatarFallback className="text-[8px] bg-brand-navy/10 text-brand-navy">{getInitials(m.name)}</AvatarFallback></Avatar>
                  <span className={cn("absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white", m.online ? "bg-green-500" : "bg-neutral-300")} />
                </span>
                <span className="text-xs text-neutral-600 truncate">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Feed */}
      <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50/30">
        <div className="px-6 py-3 border-b border-neutral-100 bg-white shrink-0">
          <h1 className="text-sm font-semibold text-brand-navy flex items-center gap-1.5"><Hash size={14} className="text-neutral-400" />{currentChannel?.name}</h1>
          <p className="text-[10px] text-neutral-400 mt-0.5">{topLevel.length} mensagem{topLevel.length !== 1 ? "s" : ""}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {topLevel.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-neutral-400">
              <Hash size={32} className="mb-2 opacity-20" />
              <p className="text-sm">Nenhuma mensagem ainda.</p>
            </div>
          )}
          {topLevel.map((post) => (
            <PostView
              key={post.id} post={post} replies={repliesOf(post.id)} currentUser={authorName}
              emojiFor={emojiFor} setEmojiFor={setEmojiFor} onReact={toggleReaction}
              onReply={() => setReplyTo(post.id)} onDelete={deletePost}
              editing={editing} editText={editText} setEditing={setEditing} setEditText={setEditText} onSaveEdit={saveEdit}
              renderContent={renderContent}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="p-4 border-t border-neutral-100 bg-white shrink-0">
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 text-xs text-neutral-500 bg-neutral-50 rounded-lg px-3 py-1.5">
              <Reply size={12} /> Respondendo a uma mensagem
              <button onClick={() => setReplyTo(null)} className="ml-auto text-neutral-400 hover:text-neutral-600"><X size={12} /></button>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachments.map((a, i) => (
                <span key={i} className="flex items-center gap-1 text-[11px] bg-neutral-100 rounded px-2 py-0.5">
                  <Paperclip size={10} /> {a}
                  <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            {/* mention autocomplete */}
            {mentionMatches.length > 0 && (
              <div className="absolute bottom-full mb-1 left-0 w-56 bg-white rounded-lg border border-neutral-200 shadow-lg z-20 py-1">
                {mentionMatches.map((n) => (
                  <button key={n} onClick={() => applyMention(n)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 text-left">
                    <Avatar className="w-5 h-5"><AvatarFallback className="text-[8px] bg-brand-navy/10 text-brand-navy">{getInitials(n)}</AvatarFallback></Avatar>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {/* emoji picker for composer */}
            {emojiFor === "composer" && (
              <div className="absolute bottom-full mb-1 right-12 bg-white rounded-lg border border-neutral-200 shadow-lg z-20 p-2 flex gap-1 flex-wrap w-48">
                {EMOJIS.map((e) => <button key={e} onClick={() => { setMessage((m) => m + e); setEmojiFor(null); }} className="text-lg hover:bg-neutral-100 rounded p-0.5">{e}</button>)}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !mentionMatches.length) { e.preventDefault(); send(); } }}
                placeholder={`Escrever em #${currentChannel?.name}...  (use @ para mencionar)`}
                rows={1}
                className="flex-1 resize-none text-sm bg-neutral-50 rounded-xl border border-neutral-200 px-4 py-2.5 focus:outline-none focus:border-brand-teal focus:bg-white transition-colors"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
              <button onClick={() => setEmojiFor(emojiFor === "composer" ? null : "composer")} className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-brand-teal hover:bg-brand-teal/5 shrink-0" title="Emoji"><Smile size={16} /></button>
              <button onClick={() => fileRef.current?.click()} className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-brand-teal hover:bg-brand-teal/5 shrink-0" title="Anexar"><Paperclip size={16} /></button>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { const names = Array.from(e.target.files ?? []).map((f) => f.name); setAttachments((a) => [...a, ...names]); }} />
              <button onClick={send} disabled={!message.trim() && attachments.length === 0}
                className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0", (message.trim() || attachments.length) ? "bg-brand-teal text-white hover:bg-brand-teal-dark" : "bg-neutral-100 text-neutral-300")}>
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostView({
  post, replies, currentUser, emojiFor, setEmojiFor, onReact, onReply, onDelete,
  editing, editText, setEditing, setEditText, onSaveEdit, renderContent, isReply,
}: any) {
  const isOwn = post.author === currentUser;
  return (
    <div className={cn("flex gap-3 group", isReply && "ml-10")}>
      <Avatar className="w-8 h-8 shrink-0 mt-0.5"><AvatarFallback className="text-[11px] bg-brand-navy/10 text-brand-navy font-medium">{getInitials(post.author)}</AvatarFallback></Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold text-brand-navy">{post.author}</span>
          <span className="text-[10px] text-neutral-400">{timeAgo(post.created_at)}</span>
          {post.edited && <span className="text-[9px] text-neutral-300">(editado)</span>}
        </div>

        {editing === post.id ? (
          <div className="flex items-center gap-1">
            <input value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(post.id); if (e.key === "Escape") setEditing(null); }}
              className="flex-1 text-sm border border-brand-teal/40 rounded-lg px-2 py-1 outline-none" />
            <button onClick={() => onSaveEdit(post.id)} className="text-green-500"><Check size={14} /></button>
            <button onClick={() => setEditing(null)} className="text-neutral-400"><X size={14} /></button>
          </div>
        ) : (
          <div className="inline-block max-w-full">
            {post.content && (
              <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap bg-white rounded-xl px-3 py-2 border border-neutral-100">
                {renderContent(post.content)}
              </p>
            )}
            {post.attachments?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {post.attachments.map((a: string, i: number) => (
                  <span key={i} className="flex items-center gap-1 text-[11px] bg-neutral-100 rounded px-2 py-1 text-neutral-600"><Paperclip size={10} /> {a}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reactions */}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {Object.entries(post.reactions ?? {}).map(([emoji, users]: any) => (
            <button key={emoji} onClick={() => onReact(post.id, emoji)}
              className={cn("flex items-center gap-1 text-xs rounded-full px-1.5 py-0.5 border", users.includes(currentUser) ? "bg-brand-teal/10 border-brand-teal/40" : "bg-neutral-50 border-neutral-200")}>
              {emoji} <span className="text-[10px] text-neutral-500">{users.length}</span>
            </button>
          ))}
          {/* action buttons (hover) */}
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
            <button onClick={() => setEmojiFor(emojiFor === post.id ? null : post.id)} className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-brand-teal" title="Reagir"><Smile size={13} /></button>
            {!isReply && <button onClick={onReply} className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-brand-navy" title="Responder"><Reply size={13} /></button>}
            {isOwn && <button onClick={() => { setEditing(post.id); setEditText(post.content); }} className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-brand-navy" title="Editar"><Pencil size={12} /></button>}
            {isOwn && <button onClick={() => onDelete(post.id)} className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-destructive" title="Excluir"><Trash2 size={12} /></button>}
            {emojiFor === post.id && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg border border-neutral-200 shadow-lg z-20 p-2 flex gap-1 flex-wrap w-48">
                {EMOJIS.map((e) => <button key={e} onClick={() => onReact(post.id, e)} className="text-lg hover:bg-neutral-100 rounded p-0.5">{e}</button>)}
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {replies?.length > 0 && (
          <div className="mt-2 space-y-2">
            {replies.map((r: Post) => (
              <PostView key={r.id} post={r} replies={[]} currentUser={currentUser}
                emojiFor={emojiFor} setEmojiFor={setEmojiFor} onReact={onReact} onReply={() => {}} onDelete={onDelete}
                editing={editing} editText={editText} setEditing={setEditing} setEditText={setEditText} onSaveEdit={onSaveEdit}
                renderContent={renderContent} isReply />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
