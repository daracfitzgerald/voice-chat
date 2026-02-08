import { useEffect, useRef, useState, useCallback } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import ControlTray from "./components/control-tray/ControlTray";
import { LiveClientOptions } from "./types";
import { useLiveAPIContext } from "./contexts/LiveAPIContext";
import { useLoggerStore } from "./lib/store-logger";
import { Modality } from "@google/genai";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

// System instruction built from Dara's context files
const SYSTEM_INSTRUCTION = `You are Dara's AI assistant. You have access to his context and memory below. Be helpful, direct, and conversational. When the conversation ends, summarise key decisions or action items.

--- USER CONTEXT ---
- Name: Dara Fitzgerald
- Pronouns: he/him
- Timezone: Europe/Madrid (CET/CEST)
- Partner: Hana (married January 30, 2026)
- Cat: Willow
- Location: Cómpeta, Spain
- Work: Measurelab
- Interests: Running, learning Spanish, tech/AI
- Phone: Pixel (Android)
- Communication: Direct, no filler. UK English spellings. No em dashes. Don't tell him to rest/sleep.

--- MEMORY ---
- Married Hana Jan 30, 2026 - celebration June 13 at Cortijo Laguna Chico
- VPS on Tailscale, Telegram bot, Mac node with various CLI tools
- Obsidian vault syncs via git
- Kanban board at kanban.darafitzgerald.co.uk
- LangGraph orchestrator on VPS (model routing: simple→Flash, medium→Sonnet, complex→Opus)
- Memory architecture planned: vectors-first (Ollama + mxbai-embed-large + LanceDB)
- Active builds: memindex, workflow skills, batch processing, self-improving prompts
- Preferences: UK English, no tables in Telegram, verify before claiming done

--- PERSONALITY GUIDELINES ---
Be helpful, not performatively helpful. Skip filler words.
Have opinions. Be resourceful before asking.
Be concise when needed, thorough when it matters.
Earn trust through competence.
`;

type ConversationEntry = {
  role: "user" | "model";
  text: string;
  time: Date;
};

function VoiceChatApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { client, setConfig, connected } = useLiveAPIContext();
  const { logs } = useLoggerStore();
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  // Set system instruction on mount
  useEffect(() => {
    setConfig({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      responseModalities: [Modality.AUDIO],
    });
  }, [setConfig]);

  // Extract conversation from logs
  useEffect(() => {
    const entries: ConversationEntry[] = [];
    for (const log of logs) {
      if (typeof log.message === "object") {
        // User text input
        if ("turns" in log.message && "turnComplete" in log.message) {
          const turns = (log.message as any).turns;
          for (const part of turns) {
            if (part.text && part.text.trim() && part.text !== "\n") {
              entries.push({ role: "user", text: part.text, time: log.date });
            }
          }
        }
        // Model text response
        if ("serverContent" in log.message) {
          const sc = (log.message as any).serverContent;
          if (sc?.modelTurn?.parts) {
            for (const part of sc.modelTurn.parts) {
              if (part.text && part.text.trim() && part.text !== "\n") {
                entries.push({ role: "model", text: part.text, time: log.date });
              }
            }
          }
        }
      }
    }
    setConversation(entries);
  }, [logs]);

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const saveTranscript = useCallback(async () => {
    if (conversation.length === 0) return;
    setSaving(true);
    const now = new Date();
    const ts = now.toISOString().replace(/:/g, "-").slice(0, 16);
    const lines = [
      `# Voice Chat Transcript - ${now.toISOString().slice(0, 10)}`,
      "",
      `Started: ${conversation[0]?.time.toISOString() || "unknown"}`,
      "",
      "---",
      "",
    ];
    for (const entry of conversation) {
      const time = entry.time.toLocaleTimeString();
      const speaker = entry.role === "user" ? "**Dara**" : "**Assistant**";
      lines.push(`${speaker} (${time}): ${entry.text}`);
      lines.push("");
    }
    const content = lines.join("\n");

    // Download as file (since we can't write to filesystem from browser)
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ts}.md`;
    a.click();
    URL.revokeObjectURL(url);

    setSaving(false);
  }, [conversation]);

  return (
    <div className="voice-chat-app">
      <header className="app-header">
        <h1>🎙️ Voice Chat</h1>
        <div className="header-actions">
          {connected && <span className="status-dot connected" />}
          <button
            className="save-btn"
            onClick={saveTranscript}
            disabled={saving || conversation.length === 0}
          >
            {saving ? "Saving..." : "💾 Save Transcript"}
          </button>
        </div>
      </header>

      <div className="conversation-log">
        {conversation.length === 0 && (
          <div className="empty-state">
            <p>Press the play button to start a conversation</p>
          </div>
        )}
        {conversation.map((entry, i) => (
          <div key={i} className={`message ${entry.role}`}>
            <span className="message-role">
              {entry.role === "user" ? "You" : "Assistant"}
            </span>
            <span className="message-text">{entry.text}</span>
          </div>
        ))}
        <div ref={conversationEndRef} />
      </div>

      {/* Hidden video ref needed by ControlTray */}
      <video ref={videoRef} style={{ display: "none" }} />

      <ControlTray
        videoRef={videoRef}
        supportsVideo={false}
        enableEditingSettings={false}
      />
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
        <VoiceChatApp />
      </LiveAPIProvider>
    </div>
  );
}

export default App;
