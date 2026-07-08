"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface Props {
  content: string;
  onChange?: (html: string) => void;
  onBlur?: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
}

export function RichTextEditor({
  content,
  onChange,
  onBlur,
  placeholder = "Adicionar descrição...",
  editable = true,
  className,
}: Props) {
  const editor = useEditor({
    extensions: [
      // StarterKit doesn't include Underline or Link by default, but
      // explicitly disable them here to avoid duplicates if a future version adds them
      StarterKit.configure({ }),
      Underline,
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer", class: "text-brand-teal underline" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    onBlur: ({ editor }) => {
      onBlur?.(editor.getHTML());
    },
  });

  // Sync content when prop changes externally
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content || "");
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;

  return (
    <div
      className={cn("border border-neutral-200 rounded-xl overflow-hidden focus-within:border-brand-teal transition-colors", className)}
      // In read-only mode Tiptap's link clickHandler bails, so open links here.
      onClick={!editable ? (e) => {
        const a = (e.target as HTMLElement).closest?.("a");
        const href = a?.getAttribute("href");
        if (href && /^(https?:|mailto:)/i.test(href)) {
          e.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
        }
      } : undefined}
    >
      {editable && (
        <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-neutral-100 bg-neutral-50/50">
          <ToolBtn
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Negrito"
          >
            <Bold size={13} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Itálico"
          >
            <Italic size={13} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Sublinhado"
          >
            <UnderlineIcon size={13} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Tachado"
          >
            <Strikethrough size={13} />
          </ToolBtn>

          <div className="w-px h-4 bg-neutral-200 mx-0.5" />

          <ToolBtn
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Título H2"
          >
            <Heading2 size={13} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Título H3"
          >
            <Heading3 size={13} />
          </ToolBtn>

          <div className="w-px h-4 bg-neutral-200 mx-0.5" />

          <ToolBtn
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Lista"
          >
            <List size={13} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Lista numerada"
          >
            <ListOrdered size={13} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Citação"
          >
            <Quote size={13} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Código"
          >
            <Code size={13} />
          </ToolBtn>

          <div className="w-px h-4 bg-neutral-200 mx-0.5" />

          <ToolBtn
            active={false}
            onClick={() => editor.chain().focus().undo().run()}
            title="Desfazer"
          >
            <Undo size={13} />
          </ToolBtn>
          <ToolBtn
            active={false}
            onClick={() => editor.chain().focus().redo().run()}
            title="Refazer"
          >
            <Redo size={13} />
          </ToolBtn>
        </div>
      )}

      <EditorContent
        editor={editor}
        className={cn(
          "prose prose-sm max-w-none p-3 min-h-[120px] text-sm text-neutral-700",
          "[&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-neutral-400",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
          !editable && "cursor-default"
        )}
      />
    </div>
  );
}

function ToolBtn({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "w-6 h-6 flex items-center justify-center rounded transition-colors",
        active
          ? "bg-brand-navy/10 text-brand-navy"
          : "text-neutral-500 hover:bg-neutral-100 hover:text-brand-navy"
      )}
    >
      {children}
    </button>
  );
}
