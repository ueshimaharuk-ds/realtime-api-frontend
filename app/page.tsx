"use client";

import { useState, useRef } from "react";

const BACKEND_URL = "https://realtime-api-backend-g6f4ddfzh3dsc9fa.japanwest-01.azurewebsites.net";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<string[]>([]);

  const socketRef = useRef<WebSocket | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const startVoice = async () => {
    try {
      setStatus("connecting...");
      addLog("🔑 バックエンドに接続中...");

      // バックエンドのWSプロキシに直接接続（Vertex AIには直接繋がない）
      const wsUrl = BACKEND_URL.replace("https://", "wss://");
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        addLog("✅ Gemini Live 接続成功");
      };

      ws.onmessage = async (event) => {
        try {
          const response = JSON.parse(event.data);

          if (response.serverContent?.modelTurn?.parts?.[0]?.text) {
            addLog(`🤖 Gemini: ${response.serverContent.modelTurn.parts[0].text}`);
          }

          if (response.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            addLog("🔊 音声バイナリデータを受信");
          }
        } catch {
          // バイナリデータ等パース不要なものは無視
        }
      };

      ws.onerror = () => {
        addLog("❌ WebSocket接続エラー");
        setStatus("error");
        setIsRunning(false);
      };

      ws.onclose = () => {
        addLog("🔌 接続が切断されました");
        setStatus("disconnected");
        setIsRunning(false);
      };

    } catch (err) {
      console.error(err);
      setStatus("error");
      addLog("❌ 接続エラー発生");
      setIsRunning(false);
    }
  };

  const stopVoice = () => {
    addLog("🛑 停止処理");
    socketRef.current?.close();
    socketRef.current = null;
    setIsRunning(false);
    setStatus("stopped");
  };

  const handleToggle = async () => {
    if (isRunning) {
      stopVoice();
    } else {
      setIsRunning(true);
      await startVoice();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6">Gemini Live 2.5 Flash 🎤</h1>

      <button
        onClick={handleToggle}
        className={`px-8 py-4 rounded-xl font-bold shadow-lg transition ${
          isRunning ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {isRunning ? "⏹ 停止" : "🎙 音声開始"}
      </button>

      <div className="mt-8 w-full max-w-xl bg-black/40 p-4 rounded-xl border border-white/10 h-64 overflow-y-auto font-mono text-sm">
        <p className="text-blue-400 mb-2">Status: {status}</p>
        {logs.map((log, i) => (
          <div key={i} className="mb-1">{log}</div>
        ))}
      </div>
    </div>
  );
}