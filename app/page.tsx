"use client";

import { useState, useRef, useEffect } from "react";

const BACKEND_WS_URL = "wss://realtime-api-backend-g6f4ddfzh3dsc9fa.japanwest-01.azurewebsites.net";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<string[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // PCM16に変換
  const float32ToPcm16 = (float32Array: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };

  // Base64エンコード
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const startVoice = async () => {
    try {
      setStatus("connecting...");
      addLog("🔌 バックエンドに接続中...");

      const ws = new WebSocket(BACKEND_WS_URL);
      socketRef.current = ws;

      ws.onopen = async () => {
        setStatus("connected");
        addLog("✅ Gemini Live 接続成功");
        addLog("🎤 マイク起動中...");

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
          streamRef.current = stream;

          const audioContext = new AudioContext({ sampleRate: 16000 });
          audioContextRef.current = audioContext;

          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const float32 = e.inputBuffer.getChannelData(0);
            const pcm16 = float32ToPcm16(float32);
            const base64 = arrayBufferToBase64(pcm16);

            const msg = {
              realtime_input: {
                media_chunks: [
                  {
                    mime_type: "audio/pcm",
                    data: base64,
                  },
                ],
              },
            };
            ws.send(JSON.stringify(msg));
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
          addLog("🎙 音声送信中...");
        } catch (err) {
          addLog("❌ マイクアクセス失敗");
          console.error(err);
        }
      };

      ws.onmessage = async (event) => {
        try {
          const response = JSON.parse(event.data);

          if (response.serverContent?.modelTurn?.parts?.[0]?.text) {
            addLog(`🤖 Gemini: ${response.serverContent.modelTurn.parts[0].text}`);
          }

          if (response.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            addLog("🔊 音声応答受信");
            // 音声再生（将来的にAudioWorkletで実装）
          }

          if (response.setupComplete) {
            addLog("⚙️ Geminiセットアップ完了");
          }
        } catch {
          // バイナリ等無視
        }
      };

      ws.onerror = () => {
        addLog("❌ WebSocket接続エラー");
        setStatus("error");
        setIsRunning(false);
      };

      ws.onclose = () => {
        addLog("🔌 接続切断");
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
    addLog("🛑 停止");

    processorRef.current?.disconnect();
    processorRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

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
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}