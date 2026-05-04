"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<string[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const startVoice = async () => {
    try {
      setStatus("connecting...");
      addLog("🔑 Vertex AI アクセストークン取得中...");

      // 1. 自前バックエンドからトークンを取得
      const tokenRes = await fetch("https://realtime-api-backend-g6f4ddfzh3dsc9fa.japanwest-01.azurewebsites.net/realtime/session", {
        method: "POST"
      });
      const { access_token, project_id, location, model_id } = await tokenRes.json();

      // 2. WebSocket 接続の開始
      const wsUrl = `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmStreamService/StreamRawPredict?access_token=${access_token}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        addLog("✅ Gemini Live 接続成功");
        
        // 初期設定メッセージの送信
        const setupMessage = {
          setup: { model: `projects/${project_id}/locations/${location}/publishers/google/models/${model_id}` }
        };
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = async (event) => {
        const response = JSON.parse(event.data);
        
        // テキスト応答の処理
        if (response.serverContent?.modelTurn?.parts?.[0]?.text) {
          addLog(`🤖 Gemini: ${response.serverContent.modelTurn.parts[0].text}`);
        }

        // 音声応答の処理（本来は AudioWorklet 等で再生しますが、ここでは受信ログのみ）
        if (response.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
          console.log("🔊 音声バイナリデータを受信");
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        addLog("❌ WebSocket接続エラー");
      };

    } catch (err) {
      console.error(err);
      setStatus("error");
      addLog("❌ 接続エラー発生");
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
        {logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
      </div>
    </div>
  );
}