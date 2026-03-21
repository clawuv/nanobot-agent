import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../hooks/useChat";
import { ProjectIcon } from "./Icons";

interface MessageBubbleProps {
  message: ChatMessage;
  onPreviewImage?: (image: { path: string; src: string }) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onPreviewImage }) => {
  const normalizeLocalPath = (rawPath: string): string => {
    if (!rawPath) return "";
    try {
      if (rawPath.startsWith("file://")) {
        const url = new URL(rawPath);
        return decodeURIComponent(url.pathname);
      }
      return decodeURIComponent(rawPath);
    } catch {
      return rawPath;
    }
  };

  const isUser = message.role === "user";
  const [imageSources, setImageSources] = useState<Array<{ path: string; src: string }>>([]);
  const attachments = (message.attachments || []).map((path) => ({
    path,
    name: path.split(/[\\/]/).pop() || path,
  }));

  useEffect(() => {
    const paths = (message.images || []).map(normalizeLocalPath).filter(Boolean);
    if (paths.length === 0) {
      setImageSources([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const previews = await Promise.all(
        paths.map(async (path) => {
          const src = await invoke<string>("load_image_preview", {
            input: { path },
          }).catch(() => "");
          return src ? { path, src } : null;
        })
      );
      if (!cancelled) {
        setImageSources(previews.filter((item): item is { path: string; src: string } => Boolean(item)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [message.images]);

  return (
    <div className={`message-row ${isUser ? "message-user" : "message-assistant"}`}>
      {!isUser && (
        <div className="message-avatar">
          <span className="message-avatar-text">🐈</span>
        </div>
      )}
      <div className={`message-bubble ${isUser ? "bubble-user" : "bubble-assistant"}`}>
        {imageSources.length > 0 && (
          <div className="message-images">
            {imageSources.map((image) => (
              <button
                key={image.path}
                className="message-image-link"
                title={image.path}
                type="button"
                onClick={() => onPreviewImage?.(image)}
              >
                <img className="message-image" src={image.src} alt="attachment" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="message-attachments">
            {attachments.map((attachment) => (
              <div key={attachment.path} className="message-attachment-item" title={attachment.path}>
                <ProjectIcon className="message-attachment-icon" />
                <span className="message-attachment-name">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}
        {isUser ? (
          message.content ? <p className="message-text">{message.content}</p> : null
        ) : (
          <div className="message-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match && !className;
                  if (isInline) {
                    return (
                      <code className="inline-code" {...props}>
                        {children}
                      </code>
                    );
                  }
                  return (
                    <div className="code-block-wrapper">
                      <div className="code-block-header">
                        <span className="code-block-lang">{match?.[1] || "code"}</span>
                        <button
                          className="code-copy-btn"
                          onClick={() => {
                            const text = String(children).replace(/\n$/, "");
                            navigator.clipboard.writeText(text);
                          }}
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="code-block-pre">
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    </div>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
