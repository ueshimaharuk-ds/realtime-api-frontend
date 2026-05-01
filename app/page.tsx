"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<string[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const startVoice = async () => {
    try {
      setStatus("connecting...");
      addLog("🔑 セッション取得中...");

      const tokenRes = await fetch(
        "https://realtime-api-backend-g6f4ddfzh3dsc9fa.japanwest-01.azurewebsites.net/realtime/session",
        { method: "POST" }
      );

      const tokenData = await tokenRes.json();
      const EPHEMERAL_KEY = tokenData.client_secret.value;

      addLog("✅ セッション取得OK");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        const audio = document.createElement("audio");
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
      };

      const dc = pc.createDataChannel("oai-events");

      dc.onmessage = (e) => {
        addLog("🤖 " + e.data);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch(
        "https://api.openai.com/v1/realtime",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${EPHEMERAL_KEY}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      const answerSDP = await response.text();

      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSDP,
      });

      setStatus("connected");
      addLog("🎤 接続完了");
    } catch (err) {
      console.error(err);
      setStatus("error");
      addLog("❌ エラー発生");
    }
  };

  const stopVoice = () => {
    addLog("🛑 停止処理");

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    setStatus("stopped");
  };

  // 🔥 トグル処理
  const handleToggle = async () => {
    if (isRunning) {
      stopVoice();
      setIsRunning(false);
    } else {
      await startVoice();
      setIsRunning(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex items-center justify-center">
      <div className="w-full max-w-xl p-6 bg-white/5 backdrop-blur rounded-2xl shadow-xl border border-white/10">

        <h1 className="text-3xl font-bold mb-4 text-center">
          🎤 Realtime Voice AI
        </h1>

        {/* ステータス */}
        <div className="mb-4 text-center">
          <span className="px-3 py-1 rounded-full text-sm bg-blue-500/20">
            Status: {status}
          </span>
        </div>

        {/* 🔥 トグルボタン */}
        <div className="flex justify-center mb-6">
          <button
            onClick={handleToggle}
            className={`px-6 py-3 rounded-xl font-semibold shadow-lg transition
              ${isRunning
                ? "bg-red-500 hover:bg-red-600"
                : "bg-blue-500 hover:bg-blue-600"
              }`}
          >
            {isRunning ? "⏹ 停止" : "🎙 音声開始"}
          </button>
        </div>

        {/* ログ */}
        <div className="h-64 overflow-y-auto bg-black/40 p-4 rounded-xl border border-white/10 text-sm space-y-2">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>

      </div>
    </div>
  );
}