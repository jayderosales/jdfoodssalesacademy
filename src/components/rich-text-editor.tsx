"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { useRef, useState } from "react";
import {
  Bold, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Undo2, Youtube,
} from "lucide-react";
import { lessonExtensions } from "@/lib/content/extensions";
import { cn } from "@/lib/utils";

/**
 * WYSIWYG editor for lessons. Writes the document JSON into a hidden input named `name`
 * so it can be submitted with a normal server-action form.
 */
export function RichTextEditor({
  name,
  initial,
  onUploadImage,
}: {
  name: string;
  initial: JSONContent | string | null;
  onUploadImage?: (file: File) => Promise<string | null>;
}) {
  const [json, setJson] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: lessonExtensions,
    content: initial ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "lesson-content min-h-64 px-3 py-3 focus:outline-none", "aria-label": "Lesson content" },
    },
    onCreate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
  });

  if (!editor) return <div className="min-h-64 rounded-lg border bg-card" />;

  const btn = (active: boolean, onClick: () => void, label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn("rounded p-1.5 hover:bg-muted", active && "bg-muted text-brand")}
    >
      <Icon className="size-4" />
    </button>
  );

  const addLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (https://…)", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addVideo = () => {
    const url = window.prompt("YouTube link");
    if (url) editor.commands.setYoutubeVideo({ src: url });
  };

  const addImage = async (file: File) => {
    if (!onUploadImage) return;
    const url = await onUploadImage(file);
    if (url) editor.chain().focus().setImage({ src: url, alt: file.name }).run();
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="sticky top-12 z-10 flex flex-wrap gap-0.5 border-b bg-card p-1 md:top-0" role="toolbar" aria-label="Formatting">
        {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Heading", Heading2)}
        {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "Subheading", Heading3)}
        {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold", Bold)}
        {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italic", Italic)}
        {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "Bullet list", List)}
        {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "Numbered list", ListOrdered)}
        {btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "Quote / script line", Quote)}
        {btn(false, () => editor.chain().focus().setHorizontalRule().run(), "Divider", Minus)}
        {btn(editor.isActive("link"), addLink, "Link", Link2)}
        {onUploadImage && btn(false, () => fileRef.current?.click(), "Image", ImageIcon)}
        {btn(false, addVideo, "YouTube video", Youtube)}
        <span className="mx-1 w-px bg-border" />
        {btn(false, () => editor.chain().focus().undo().run(), "Undo", Undo2)}
        {btn(false, () => editor.chain().focus().redo().run(), "Redo", Redo2)}
      </div>
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={json} />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addImage(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
