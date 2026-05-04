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

  // 音声再生キュー
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const float32ToPcm16 = (float32Array: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const base64ToPcmAudioBuffer = (base64: string, audioContext: AudioContext): AudioBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x8000;
    }
    // Geminiの出力は24kHz
    const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);
    return audioBuffer;
  };

  const scheduleAudio = (base64: string) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    try {
      const audioBuffer = base64ToPcmAudioBuffer(base64, audioContext);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      // 途切れないよう連続スケジューリング
      const startTime = Math.max(audioContext.currentTime, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;
    } catch (e) {
      console.error("音声スケジュールエラー:", e);
    }
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
          nextPlayTimeRef.current = 0;

          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const float32 = e.inputBuffer.getChannelData(0);
            const pcm16 = float32ToPcm16(float32);
            const base64 = arrayBufferToBase64(pcm16);
            ws.send(JSON.stringify({
              realtime_input: {
                media_chunks: [{ mime_type: "audio/pcm", data: base64 }],
              },
            }));
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
          let data: string;
          if (event.data instanceof Blob) {
            data = await event.data.text();
          } else {
            data = event.data;
          }

          const response = JSON.parse(data);

          if (response.setupComplete) {
            addLog("⚙️ Geminiセットアップ完了");
          }

          const parts = response.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.text) {
                addLog(`🤖 Gemini: ${part.text}`);
              }
              if (part.inlineData?.mimeType === "audio/pcm" && part.inlineData?.data) {
                scheduleAudio(part.inlineData.data);
              }
            }
          }

          if (response.serverContent?.interrupted) {
            addLog("⚡ 応答割り込み");
            // 割り込み時は再生タイムラインをリセット
            nextPlayTimeRef.current = audioContextRef.current?.currentTime ?? 0;
          }

        } catch {
          // パース不能データは無視
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
    nextPlayTimeRef.current = 0;
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