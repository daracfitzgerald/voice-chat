import { useEffect, useRef, useState, useCallback } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import PasswordGate from "./components/PasswordGate";
import ControlTray from "./components/control-tray/ControlTray";
import { LiveClientOptions } from "./types";
import { useLiveAPIContext } from "./contexts/LiveAPIContext";
import { useLoggerStore } from "./lib/store-logger";
import { Modality, Type } from "@google/genai";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

// System instruction built from Dara's context files
// Voice bridge relay config
const VOICE_BRIDGE_URL = process.env.REACT_APP_VOICE_BRIDGE_URL || 'http://100.69.233.8:5052';
const VOICE_BRIDGE_SECRET = process.env.REACT_APP_VOICE_BRIDGE_SECRET || 'voice-bridge-2026';

const SYSTEM_INSTRUCTION = `You are Dara's AI assistant. You have access to his context and memory below. Be helpful, direct, and conversational. When the conversation ends, summarise key decisions or action items.

IMPORTANT: You have function calling tools available. When Dara asks you to DO something (create a task, check status, build something, run the batch, search for info), use the appropriate function. These functions send commands to OpenClaw, his AI agent system, which will execute them.

CRITICAL UX RULE: ALWAYS speak to Dara BEFORE calling a function. Say something like "Sure, sending that to OpenClaw now" or "On it, let me send that through" FIRST, then call the function. Never go silent while processing a function call. The user experience depends on you responding verbally immediately, then calling the function. After the function completes, you can confirm it was sent.

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
  const { setConfig, connected } = useLiveAPIContext();
  const { logs } = useLoggerStore();
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  // Send command to voice bridge relay
  const sendToBridge = useCallback(async (action: string, params: Record<string, string>) => {
    try {
      const resp = await fetch(`${VOICE_BRIDGE_URL}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: VOICE_BRIDGE_SECRET, action, params }),
      });
      const data = await resp.json();
      return { success: data.status === 'sent', message: data.message || 'sent' };
    } catch (e) {
      return { success: false, message: `Bridge error: ${e}` };
    }
  }, []);

  // Set system instruction on mount
  useEffect(() => {
    setConfig({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      responseModalities: [Modality.AUDIO],
      tools: [{
        functionDeclarations: [
          {
            name: 'create_task',
            description: 'Create a new task on the kanban board',
            parameters: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Task title' },
                description: { type: Type.STRING, description: 'Task description' },
              },
              required: ['title'],
            },
          },
          {
            name: 'run_batch',
            description: 'Run the batch processor to handle autonomous tasks on the kanban board',
            parameters: { type: Type.OBJECT, properties: {} },
          },
          {
            name: 'check_status',
            description: 'Ask OpenClaw for a status update on current work',
            parameters: { type: Type.OBJECT, properties: {} },
          },
          {
            name: 'search',
            description: 'Search across vault, kanban, memory, and sessions',
            parameters: {
              type: Type.OBJECT,
              properties: {
                query: { type: Type.STRING, description: 'What to search for' },
              },
              required: ['query'],
            },
          },
          {
            name: 'build',
            description: 'Ask OpenClaw to orchestrate building something end-to-end',
            parameters: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING, description: 'What to build' },
              },
              required: ['description'],
            },
          },
          {
            name: 'send_message',
            description: 'Send a free-form command or message to OpenClaw',
            parameters: {
              type: Type.OBJECT,
              properties: {
                message: { type: Type.STRING, description: 'The message or command to send' },
              },
              required: ['message'],
            },
          },
        ],
      }],
    });
  }, [setConfig]);

  // Track which function calls we've already handled
  const handledCalls = useRef<Set<string>>(new Set());

  // Extract conversation from logs and handle function calls
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
        // Model text response or function call
        if ("serverContent" in log.message) {
          const sc = (log.message as any).serverContent;
          if (sc?.modelTurn?.parts) {
            for (const part of sc.modelTurn.parts) {
              if (part.text && part.text.trim() && part.text !== "\n") {
                entries.push({ role: "model", text: part.text, time: log.date });
              }
              // Handle function calls
              if (part.functionCall) {
                const fc = part.functionCall;
                const callId = `${fc.name}-${JSON.stringify(fc.args)}-${log.date.getTime()}`;
                if (!handledCalls.current.has(callId)) {
                  handledCalls.current.add(callId);
                  entries.push({ role: "model", text: `🔧 Sending to OpenClaw: ${fc.name}(${JSON.stringify(fc.args || {})})`, time: log.date });
                  
                  // Fire and forget - send to bridge
                  const action = fc.name === 'send_message' ? 'send_message' : fc.name;
                  const params = fc.args || {};
                  
                  if (action === 'send_message') {
                    fetch(`${VOICE_BRIDGE_URL}/command`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ secret: VOICE_BRIDGE_SECRET, command: params.message }),
                    }).catch(console.error);
                  } else {
                    sendToBridge(action, params).catch(console.error);
                  }
                }
              }
            }
          }
        }
      }
    }
    setConversation(entries);
  }, [logs, sendToBridge]);

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
    <PasswordGate>
      <div className="App">
        <LiveAPIProvider options={apiOptions}>
          <VoiceChatApp />
        </LiveAPIProvider>
      </div>
    </PasswordGate>
  );
}

export default App;
