import React, { useState, useEffect } from "react";
import {
  ChatBubbleIcon,
  ClockIcon,
  SearchIcon,
  SidebarIcon,
  EditIcon,
  SettingsIcon,
} from "./Icons";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSelectSession: (key: string) => void;
  onDeleteSession: (key: string) => void;
  onOpenCron: () => void;
  onOpenSettings: () => void;
  currentSessionKey: string;
  connected: boolean;
  gatewayUrl: string;
  currentView: "chat" | "cron" | "settings";
}

interface SessionItem {
  key: string;
  created_at?: string;
  updated_at?: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenCron,
  onOpenSettings,
  currentSessionKey,
  connected,
  gatewayUrl,
  currentView,
}) => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);

  const httpUrl = gatewayUrl.replace("ws://", "http://").replace("wss://", "https://");

  // Fetch sessions
  useEffect(() => {
    if (!connected) return;
    const fetchSessions = async () => {
      try {
        const res = await fetch(`${httpUrl}/api/sessions`);
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      } catch {
        // Failed to fetch sessions
      }
    };
    fetchSessions();
    const interval = setInterval(fetchSessions, 15000);
    return () => clearInterval(interval);
  }, [connected, httpUrl]);

  const filteredSessions = sessions.filter((s) =>
    searchQuery ? s.key.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  const formatSessionName = (key: string): string => {
    const parts = key.split(":");
    const id = parts.length > 1 ? parts[1] : key;
    if (id === "direct") return "默认对话";
    if (/^\d+$/.test(id)) {
      const date = new Date(parseInt(id));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("zh-CN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
    return id.slice(0, 20);
  };

  const handleDelete = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    onDeleteSession(key);
    setSessions((prev) => prev.filter((s) => s.key !== key));
  };

  return (
    <aside className={`sidebar ${isOpen ? "sidebar-open" : "sidebar-closed"}`}>
      {/* Top section */}
      <div className="sidebar-top">
        <div className="sidebar-header">
          <div className="sidebar-logo-area">
            <span className="sidebar-logo-emoji">🐈</span>
            <span className="sidebar-logo-text">nanobot</span>
          </div>
          <div className="sidebar-actions">
            <button className="sidebar-icon-btn" onClick={onToggle} title="收起侧栏">
              <SidebarIcon />
            </button>
            <button className="sidebar-icon-btn" onClick={onNewChat} title="新聊天">
              <EditIcon />
            </button>
          </div>
        </div>

        {/* New Chat button */}
        <div className="sidebar-nav">
          <button className="sidebar-nav-item sidebar-new-chat" onClick={onNewChat}>
            <span className="sidebar-nav-icon"><ChatBubbleIcon /></span>
            <span className="sidebar-nav-label">新对话</span>
          </button>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <div className="sidebar-search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="搜索对话..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Session list */}
        <div className="sidebar-history">
          <div className="sidebar-history-label">对话历史</div>
          {filteredSessions.length === 0 ? (
            <div className="sidebar-empty">暂无对话</div>
          ) : (
            filteredSessions.map((session) => (
              <div
                key={session.key}
                className={`sidebar-session-item ${session.key === currentSessionKey ? "active" : ""}`}
                onClick={() => onSelectSession(session.key)}
                onMouseEnter={() => setHoveredSession(session.key)}
                onMouseLeave={() => setHoveredSession(null)}
                title={session.key}
              >
                <span className="sidebar-session-name">
                  {formatSessionName(session.key)}
                </span>
                {hoveredSession === session.key && (
                  <button
                    className="sidebar-session-delete"
                    onClick={(e) => handleDelete(e, session.key)}
                    title="删除对话"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bottom section */}
      <div className="sidebar-bottom">
        <button
          className={`sidebar-settings-btn ${currentView === "cron" ? "active" : ""}`}
          onClick={onOpenCron}
        >
          <ClockIcon />
          <span>定时任务</span>
        </button>
        <button
          className={`sidebar-settings-btn ${currentView === "settings" ? "active" : ""}`}
          onClick={onOpenSettings}
        >
          <SettingsIcon />
          <span>设置</span>
        </button>
        <div className="sidebar-status">
          <span className={`status-dot ${connected ? "dot-connected" : "dot-disconnected"}`} />
          <span className="status-text">
            {connected ? "已连接" : "未连接"}
          </span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
