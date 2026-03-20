import React, { useState, useRef, useEffect } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  PlusIcon,
  SendIcon,
  SidebarIcon,
  RefreshIcon,
  CloseIcon,
  GPTIcon,
} from "./Icons";
import MessageBubble from "./MessageBubble";
import type { ChatMessage } from "../hooks/useChat";

interface ChatMainProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  progress: string;
  connected: boolean;
  onSend: (content: string, images?: string[]) => void;
  modelLabel?: string;
  providerLabel?: string;
  modelOptions?: Array<{ id: string; name: string; enabled: boolean }>;
  selectedModelId?: string;
  onSelectModel?: (modelId: string) => void;
  modelSwitching?: boolean;
}

interface PendingImage {
  path: string;
  name: string;
  previewUrl: string;
}

interface ImagePathInfo {
  path: string;
  name: string;
  sizeBytes: number;
  extension: string;
}

interface PreviewImage {
  path: string;
  src: string;
}

const ChatMain: React.FC<ChatMainProps> = ({
  sidebarOpen,
  onToggleSidebar,
  onNewChat,
  messages,
  isLoading,
  progress,
  connected,
  onSend,
  modelLabel,
  providerLabel,
  modelOptions,
  selectedModelId,
  onSelectModel,
  modelSwitching,
}) => {
  const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
  const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
  const [inputValue, setInputValue] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, progress]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + "px";
    }
  }, [inputValue]);

  useEffect(() => {
    if (!previewImage) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  useEffect(() => {
    if (!modelMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModelMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modelMenuOpen]);

  const appendPendingImages = (paths: string[]) => {
    setPendingImages((prev) => {
      const existing = new Set(prev.map((item) => item.path));
      const next = [...prev];
      for (const path of paths) {
        if (!path || existing.has(path)) continue;
        next.push({
          path,
          name: path.split(/[\\/]/).pop() || path,
          previewUrl: convertFileSrc(path),
        });
      }
      return next;
    });
  };

  const setAttachmentFeedback = (messages: string[]) => {
    setAttachmentError(messages.filter(Boolean).join(" "));
  };

  const validateImageInfos = (items: ImagePathInfo[]) => {
    const accepted: string[] = [];
    const rejected: string[] = [];

    for (const item of items) {
      if (!SUPPORTED_IMAGE_EXTENSIONS.has(item.extension)) {
        rejected.push(`${item.name} 格式不支持`);
        continue;
      }
      if (item.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
        rejected.push(`${item.name} 超过 10MB`);
        continue;
      }
      accepted.push(item.path);
    }

    setAttachmentFeedback(rejected);
    return accepted;
  };

  const inspectAndAppendPaths = async (paths: string[]) => {
    if (paths.length === 0) return;

    const infos = await invoke<ImagePathInfo[]>("inspect_image_paths", {
      input: { paths },
    }).catch(() => []);

    const accepted = validateImageInfos(infos);
    appendPendingImages(accepted);
  };

  const handleSend = () => {
    if ((!inputValue.trim() && pendingImages.length === 0) || isLoading) return;
    onSend(
      inputValue,
      pendingImages.map((image) => image.path)
    );
    setInputValue("");
    setPendingImages([]);
    setAttachmentError("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handlePickImages = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: Array.from(SUPPORTED_IMAGE_EXTENSIONS) }],
    });

    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    await inspectAndAppendPaths(paths);
  };

  const handleRemovePendingImage = (path: string) => {
    setPendingImages((prev) => prev.filter((image) => image.path !== path));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const newPaths: string[] = [];
    const rejected: string[] = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        rejected.push(`${file.name || "粘贴图片"} 超过 10MB`);
        continue;
      }
      if (file.type && !file.type.startsWith("image/")) {
        rejected.push(`${file.name || "粘贴图片"} 格式不支持`);
        continue;
      }

      const nativePath = (file as File & { path?: string }).path;
      if (nativePath) {
        newPaths.push(nativePath);
        continue;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read_failed"));
        reader.readAsDataURL(file);
      }).catch(() => "");

      if (!dataUrl) continue;

      const persistedPath = await invoke<string>("persist_clipboard_image", {
        input: { dataUrl },
      }).catch(() => "");

      if (persistedPath) {
        newPaths.push(persistedPath);
      } else {
        rejected.push(`${file.name || "粘贴图片"} 导入失败`);
      }
    }

    setAttachmentFeedback(rejected);
    await inspectAndAppendPaths(newPaths);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const hasFiles = Array.from(e.dataTransfer.items || []).some((item) => item.kind === "file");
    if (!hasFiles) return;
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files || []);
    const acceptedPaths: string[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        rejected.push(`${file.name} 不是图片`);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        rejected.push(`${file.name} 超过 10MB`);
        continue;
      }
      const path = (file as File & { path?: string }).path || "";
      if (path) {
        acceptedPaths.push(path);
      } else {
        rejected.push(`${file.name} 无法读取本地路径`);
      }
    }

    setAttachmentFeedback(rejected);
    void inspectAndAppendPaths(acceptedPaths);
  };

  const hasMessages = messages.length > 0;
  const canSend = (!!inputValue.trim() || pendingImages.length > 0) && !isLoading;

  return (
    <div className="chat-main">
      {/* Top bar */}
      <header className="chat-header">
        <div className="chat-header-left">
          {!sidebarOpen && (
            <button className="header-icon-btn" onClick={onToggleSidebar} title="打开侧栏">
              <SidebarIcon />
            </button>
          )}
          <div className="chat-model-selector">
            {modelOptions && modelOptions.length > 0 ? (
              <div className="chat-model-switch-wrap" ref={modelMenuRef}>
                <button
                  type="button"
                  className="chat-model-switch"
                  disabled={modelSwitching}
                  onClick={() => setModelMenuOpen((prev) => !prev)}
                  title={providerLabel ? `${modelLabel || "nanobot"} · ${providerLabel}` : modelLabel || "nanobot"}
                  aria-haspopup="menu"
                  aria-expanded={modelMenuOpen}
                >
                  <GPTIcon className="chat-model-icon" />
                  <span>{modelLabel || "nanobot"}</span>
                </button>
                {modelMenuOpen ? (
                  <div className="chat-model-menu" role="menu">
                    {modelOptions.map((item) => {
                      const isSelected = item.id === selectedModelId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isSelected}
                          className={`chat-model-menu-item ${isSelected ? "selected" : ""}`}
                          disabled={!item.enabled || modelSwitching}
                          onClick={() => {
                            setModelMenuOpen(false);
                            if (!isSelected) {
                              onSelectModel?.(item.id);
                            }
                          }}
                        >
                          <span className="chat-model-menu-check">{isSelected ? "✓" : ""}</span>
                          <span className="chat-model-menu-label">{item.name}</span>
                          {!item.enabled ? <span className="chat-model-menu-meta">停用</span> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <span className="chat-model-name">
                <GPTIcon className="chat-model-icon" />
                <span>{modelLabel || "nanobot"}</span>
              </span>
            )}
          </div>
        </div>
        <div className="chat-header-right">
          <button className="header-icon-btn" onClick={onNewChat} title="新聊天">
            <RefreshIcon />
          </button>
        </div>
      </header>

      {/* Messages / Welcome */}
      <div className="chat-content">
        {!hasMessages ? (
          <div className="chat-welcome">
            <div className="chat-welcome-logo">🐈</div>
            <h1 className="chat-welcome-title">有什么可以帮你的？</h1>
            <p className="chat-welcome-subtitle">
              {connected ? "已连接到 nanobot Gateway" : "正在连接 Gateway..."}
            </p>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onPreviewImage={setPreviewImage} />
            ))}

            {/* Loading / Progress */}
            {isLoading && (
              <div className="message-row message-assistant">
                <div className="message-avatar">
                  <span className="message-avatar-text">🐈</span>
                </div>
                <div className="message-bubble bubble-assistant">
                  {progress ? (
                    <p className="message-progress">{progress}</p>
                  ) : (
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          {pendingImages.length > 0 && (
            <div className="chat-attachments">
              {pendingImages.map((image) => (
                <div className="chat-attachment-chip" key={image.path}>
                  <img className="chat-attachment-thumb" src={image.previewUrl} alt={image.name} />
                  <div className="chat-attachment-meta">
                    <span className="chat-attachment-name">{image.name}</span>
                  </div>
                  <button
                    className="chat-attachment-remove"
                    type="button"
                    onClick={() => handleRemovePendingImage(image.path)}
                    title="移除图片"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {attachmentError ? <p className="chat-input-error">{attachmentError}</p> : null}
          <div
            className={`chat-input-container ${dragOver ? "drag-over" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <button className="chat-input-plus" title="添加图片" type="button" onClick={handlePickImages}>
              <PlusIcon />
            </button>
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="发送消息给 nanobot..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              disabled={!connected}
              />
            <div className="chat-input-actions">
              <button
                className={`chat-input-send ${canSend ? "active" : ""}`}
                onClick={handleSend}
                disabled={!canSend}
                title="发送"
              >
                <SendIcon />
              </button>
            </div>
          </div>
          <p className="chat-input-hint">支持点击加号、粘贴截图或拖拽图片到输入框，图片限 10MB，支持 Ctrl/Cmd+Enter 发送。</p>
        </div>

        <footer className="chat-footer">
          <p>nanobot Desktop — 超轻量个人 AI 助手</p>
        </footer>
      </div>

      {previewImage && (
        <div className="chat-image-preview-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="chat-image-preview-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="chat-image-preview-header">
              <div className="chat-image-preview-meta">
                <span className="chat-image-preview-title">图片预览</span>
                <span className="chat-image-preview-path">{previewImage.path}</span>
              </div>
              <button
                className="chat-image-preview-close"
                type="button"
                onClick={() => setPreviewImage(null)}
                title="关闭预览"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="chat-image-preview-body">
              <img className="chat-image-preview-image" src={previewImage.src} alt="preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMain;
