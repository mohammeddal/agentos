import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { attachmentError, fileSize, type Attachment } from "./attachment-model";
import { previewAttachment, saveAttachment, type AttachmentPreview } from "./attachment-storage";
import "./attachments.css";

function AttachmentItem({
  attachment,
  open,
  remove,
  disabled,
}: {
  attachment: Attachment;
  open: () => void;
  remove?: () => void;
  disabled?: boolean | undefined;
}) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    if (attachment.kind === "image")
      void previewAttachment(attachment)
        .then((p) => {
          if (active) setImage(p.dataUrl || "");
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [attachment.id]);
  return (
    <div className="co-attachment-item">
      <button
        type="button"
        className="co-attachment-open"
        onClick={open}
        aria-label={`Preview ${attachment.name}`}
      >
        {image ? (
          <img src={image} alt="" />
        ) : attachment.kind === "image" ? (
          <ImageIcon size={22} />
        ) : (
          <FileText size={22} />
        )}
        <span>
          <strong>{attachment.name}</strong>
          <small>
            {fileSize(attachment.size)} ·{" "}
            {attachment.kind === "pdf"
              ? "PDF · text only"
              : attachment.kind === "image"
                ? "Image"
                : "Text"}
          </small>
        </span>
      </button>
      {remove && (
        <button
          type="button"
          className="co-attachment-remove"
          onClick={remove}
          disabled={disabled}
          aria-label={`Remove ${attachment.name}`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function AttachmentList({
  value,
  remove,
  disabled,
}: {
  value: Attachment[];
  remove?: (id: string) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<Attachment | null>(null);
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setPreview(null);
    setError("");
    if (selected)
      void previewAttachment(selected)
        .then((p) => {
          if (active) setPreview(p);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [selected]);
  if (!value.length) return null;
  return (
    <>
      <div className="co-attachment-list" aria-label="Attached files">
        {value.map((a) => (
          <AttachmentItem
            key={a.id}
            attachment={a}
            open={() => setSelected(a)}
            {...(remove ? { remove: () => remove(a.id) } : {})}
            disabled={disabled}
          />
        ))}
      </div>
      {selected && (
        <section
          className="co-attachment-expanded"
          aria-label={`Attachment preview: ${selected.name}`}
        >
          <header>
            <strong>{selected.name}</strong>
            <button type="button" className="co-button" onClick={() => setSelected(null)}>
              Close preview
            </button>
          </header>
          <div className="co-attachment-preview">
            {error ? (
              <p role="alert">{error}</p>
            ) : !preview ? (
              <p role="status">Loading preview…</p>
            ) : preview.dataUrl ? (
              <img src={preview.dataUrl} alt={selected.name} />
            ) : (
              <>
                <p>
                  {selected.kind === "pdf"
                    ? "Extracted PDF text. Page images and layout are not included."
                    : "File contents"}
                </p>
                <pre>{preview.text}</pre>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
export function AttachmentEditor({
  value,
  onChange,
  onBusy,
  disabled,
  compact = false,
  actions,
  children,
}: {
  value: Attachment[];
  onChange: (value: Attachment[]) => void;
  onBusy: (busy: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const current = useRef(value);
  current.current = value;
  const active = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function add(files: File[]) {
    if (disabled || busyRef.current || !files.length) return;
    busyRef.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    const errors: string[] = [];
    let next = [...current.current];
    try {
      for (const file of files) {
        const issue = attachmentError(file, next);
        if (issue) {
          errors.push(`${file.name}: ${issue}`);
          continue;
        }
        try {
          const attachment = await saveAttachment(file);
          next = [...next, attachment];
        } catch (e) {
          errors.push(`${file.name}: ${String(e).replace(/^Error: /, "")}`);
        }
      }
      if (active.current) {
        current.current = next;
        onChange(next);
        setError(errors.join("\n"));
      }
    } finally {
      busyRef.current = false;
      if (active.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <div
      className={`co-attachment-editor ${compact ? "is-compact" : ""} ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = disabled || busy ? "none" : "copy";
          setDragging(!disabled && !busy);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void add(Array.from(e.dataTransfer.files));
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) {
          e.preventDefault();
          void add(files);
        }
      }}
    >
      {dragging && <div className="co-attachment-drop-label">Drop files to attach</div>}
      {children}
      <AttachmentList
        value={value}
        disabled={disabled || busy}
        remove={(id) => onChange(value.filter((a) => a.id !== id))}
      />
      <div className="co-attachment-toolbar">
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Choose attachments"
          onChange={(e) => {
            void add(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="co-attach-button"
          aria-label={busy ? "Adding files" : "Attach files"}
          title={busy ? "Adding files…" : "Attach files"}
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          <Paperclip size={15} />
          {!compact && (busy ? "Adding files…" : "Attach files")}
        </button>
        {!compact && <span>or drop files / paste images</span>}
        {actions && <div className="co-attachment-actions">{actions}</div>}
      </div>
      {!compact && (
        <details className="co-attachment-help">
          <summary>Supported files & privacy</summary>
          <p>
            PNG, JPEG, WebP, GIF, text PDFs, and UTF-8 text/code. Up to 8 files, 5 MB each, 20 MB
            total. Documents: up to 100 KB of text each, 200 KB combined. Scanned PDFs: attach page
            images instead. Files are copied locally; sending shares their contents with the
            selected provider. Task attachments are shared with its participating agents when run.
          </p>
        </details>
      )}
      {!compact && value.length > 0 && (
        <p className="co-attachment-sharing">
          {value.length} {value.length === 1 ? "file" : "files"} attached · Shared with the selected
          engine when sent or run.
        </p>
      )}
      {error && (
        <p className="co-form-error co-attachment-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
