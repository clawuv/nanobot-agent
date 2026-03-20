import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../hooks/useChat";

interface MessageBubbleProps {
  message: ChatMessage;
  onPreviewImage?: (image: { path: string; src: string }) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onPreviewImage }) => {
  const isUser = message.role === "user";
  const imageSources = (message.images || []).map((path) => ({
    path,
    src: convertFileSrc(path),
  }));

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
