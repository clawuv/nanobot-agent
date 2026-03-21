import { useState, useCallback, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatMain from "@/components/ChatMain";
import CronPage from "@/components/CronPage";
import SettingsPage from "@/components/SettingsPage";
import type { AppearanceSettings } from "@/components/SettingsPage";
import { useChat } from "@/hooks/useChat";

type ViewMode = "chat" | "cron" | "settings";

const defaultAppearance: AppearanceSettings = {
  theme: "system",
  bubbleStyle: "rounded",
  fontScale: "medium",
  motionLevel: "balanced",
  compactMode: false,
};

const readAppearance = (): AppearanceSettings => {
  try {
    const raw = localStorage.getItem("nanobot_desktop_appearance");
    return raw ? { ...defaultAppearance, ...JSON.parse(raw) } : defaultAppearance;
  } catch {
    return defaultAppearance;
  }
};

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [currentSessionKey, setCurrentSessionKey] = useState("desktop:direct");
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => readAppearance());
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  const [activeModelLabel, setActiveModelLabel] = useState("nanobot");
  const [activeProviderLabel, setActiveProviderLabel] = useState("");
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; name: string; enabled: boolean; provider: string }>>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [currentSessionModelId, setCurrentSessionModelId] = useState("");
  const [providerLabels, setProviderLabels] = useState<Record<string, string>>({});
  const [switchingModel, setSwitchingModel] = useState(false);
  const [modelSwitchFeedback, setModelSwitchFeedback] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState(() => {
    return localStorage.getItem("nanobot_gateway_url") || "ws://localhost:18790";
  });
  const httpUrl = gatewayUrl.replace("ws://", "http://").replace("wss://", "https://");

  const chat = useChat({
    gatewayUrl,
    sessionKey: currentSessionKey,
    modelId: currentSessionModelId || defaultModelId,
  });

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const handleNewChat = useCallback(() => {
    const key = `desktop:${Date.now()}`;
    setCurrentSessionKey(key);
    setCurrentSessionModelId(defaultModelId);
    chat.clearMessages();
  }, [chat, defaultModelId]);

  const handleSelectSession = useCallback(
    async (key: string) => {
      setCurrentSessionKey(key);
      const session = await chat.loadSession(key);
      setCurrentSessionModelId(session?.modelId || defaultModelId);
    },
    [chat, defaultModelId]
  );

  const handleDeleteSession = useCallback(
    async (key: string) => {
      const httpUrl = gatewayUrl.replace("ws://", "http://").replace("wss://", "https://");
      const safeKey = key.replace(":", "__");
      try {
        await fetch(`${httpUrl}/api/sessions/${safeKey}`, { method: "DELETE" });
      } catch {
        // ignore
      }
      if (key === currentSessionKey) {
        setCurrentSessionKey("desktop:direct");
        setCurrentSessionModelId(defaultModelId);
        chat.clearMessages();
      }
    },
    [gatewayUrl, currentSessionKey, chat, defaultModelId]
  );

  const handleGatewayUrlChange = useCallback((url: string) => {
    setGatewayUrl(url);
    localStorage.setItem("nanobot_gateway_url", url);
    // Force page reload to reconnect WebSocket with new URL
    window.location.reload();
  }, []);

  useEffect(() => {
    localStorage.setItem("nanobot_desktop_appearance", JSON.stringify(appearance));

    const root = document.documentElement;
    root.dataset.fontScale = appearance.fontScale;
    root.dataset.motionLevel = appearance.motionLevel;
    root.dataset.bubbleStyle = appearance.bubbleStyle;
    root.dataset.themePreference = appearance.theme;

    root.classList.toggle("compact-mode", appearance.compactMode);
  }, [appearance]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const nextTheme =
        appearance.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : appearance.theme === "light"
            ? "light"
            : "dark";

      setResolvedTheme(nextTheme);
      document.documentElement.dataset.themeResolved = nextTheme;
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [appearance.theme]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [configResponse, modelsResponse] = await Promise.all([
          fetch(`${httpUrl}/api/config`),
          fetch(`${httpUrl}/api/models`),
        ]);
        if (!configResponse.ok) {
          setActiveModelLabel("nanobot");
          setActiveProviderLabel("");
          return;
        }
        const data = await configResponse.json();
        const nextLabel = data?.activeModel?.name || data?.model || "nanobot";
        const nextDefaultModelId = data?.defaultModelId || "";
        setActiveModelLabel(nextLabel);
        setActiveProviderLabel(data?.provider || "");
        setDefaultModelId(nextDefaultModelId);
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          setModelOptions((modelsData?.items || []).map((item: { id: string; name: string; enabled: boolean; provider: string }) => ({
            id: item.id,
            name: item.name,
            enabled: item.enabled,
            provider: item.provider,
          })));
          setProviderLabels(
            Object.fromEntries(((modelsData?.providers || []) as Array<{ id: string; label: string }>).map((item) => [item.id, item.label]))
          );
        }
        setCurrentSessionModelId((prev) => prev || nextDefaultModelId);
      } catch {
        setActiveModelLabel("nanobot");
        setActiveProviderLabel("");
        setModelOptions([]);
        setDefaultModelId("");
        setCurrentSessionModelId("");
        setProviderLabels({});
      }
    };

    void loadConfig();
    const onConfigChanged = () => void loadConfig();
    window.addEventListener("nanobot-config-changed", onConfigChanged);
    return () => window.removeEventListener("nanobot-config-changed", onConfigChanged);
  }, [gatewayUrl]);

  useEffect(() => {
    void (async () => {
      const session = await chat.loadSession(currentSessionKey);
      setCurrentSessionModelId(session?.modelId || defaultModelId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const selectedModel = modelOptions.find((item) => item.id === (currentSessionModelId || defaultModelId));
    if (selectedModel) {
      setActiveModelLabel(selectedModel.name);
      setActiveProviderLabel(providerLabels[selectedModel.provider] || selectedModel.provider);
    }
  }, [currentSessionModelId, defaultModelId, modelOptions, providerLabels]);

  const sessionModelDebugLabel = currentSessionKey ? `当前会话ID: ${currentSessionKey}` : "";

  const handleQuickSwitchModel = useCallback(
    async (modelId: string) => {
      if (!modelId || modelId === currentSessionModelId) return;
      setSwitchingModel(true);
      setModelSwitchFeedback("");
      try {
        const safeKey = currentSessionKey.replace(":", "__");
        const response = await fetch(`${httpUrl}/api/sessions/${safeKey}/model`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId: modelId || null }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setModelSwitchFeedback(data.error || "切换模型失败");
          return;
        }
        const selected = modelOptions.find((item) => item.id === modelId);
        setCurrentSessionModelId(modelId);
        setModelSwitchFeedback(`已切换到 ${selected?.name || "新模型"}`);
      } catch {
        setModelSwitchFeedback("切换模型失败");
      } finally {
        setSwitchingModel(false);
      }
    },
    [currentSessionKey, currentSessionModelId, httpUrl, modelOptions]
  );

  useEffect(() => {
    if (!modelSwitchFeedback) return;
    const timer = window.setTimeout(() => {
      setModelSwitchFeedback("");
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [modelSwitchFeedback]);

  return (
    <div className={`app-container theme-${resolvedTheme}`}>
      {viewMode === "chat" ? (
        <>
          <Sidebar
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            onNewChat={handleNewChat}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onOpenCron={() => setViewMode("cron")}
            onOpenSettings={() => setViewMode("settings")}
            currentSessionKey={currentSessionKey}
            connected={chat.connected}
            gatewayUrl={gatewayUrl}
            currentView={viewMode}
          />
          <ChatMain
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            onNewChat={handleNewChat}
            sessionKey={currentSessionKey}
            messages={chat.messages}
            isLoading={chat.isLoading}
            progress={chat.progress}
            connected={chat.connected}
            onSend={chat.send}
            modelLabel={activeModelLabel}
            providerLabel={activeProviderLabel}
            modelOptions={modelOptions}
            selectedModelId={currentSessionModelId || defaultModelId}
            onSelectModel={handleQuickSwitchModel}
            modelSwitching={switchingModel}
            sessionModelDebugLabel={sessionModelDebugLabel}
          />
        </>
      ) : viewMode === "cron" ? (
        <CronPage gatewayUrl={gatewayUrl} onBack={() => setViewMode("chat")} />
      ) : (
        <SettingsPage
          gatewayUrl={gatewayUrl}
          onGatewayUrlChange={handleGatewayUrlChange}
          onBack={() => setViewMode("chat")}
          appearance={appearance}
          onAppearanceChange={setAppearance}
        />
      )}
    </div>
  );
}

export default App;
