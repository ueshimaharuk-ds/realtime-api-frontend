"use client";
import { useRef } from "react";

export default function Home() {
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const startVoice = async () => {
    // ① セッション取得
    const tokenRes = await fetch("https://realtime-api-backend-g6f4ddfzh3dsc9fa.japanwest-01.azurewebsites.net/realtime/session", {
      method: "POST",
    });
    const tokenData = await tokenRes.json();
    console.log("tokenData:", tokenData);

    const EPHEMERAL_KEY = tokenData.client_secret.value;
    
    // ② PeerConnection作成
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    // ③ 音声受信設定
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;

    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
    };



    // ④ マイク取得
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // ⑤ データチャネル（任意）
    pc.createDataChannel("oai-events");

    // ⑥ SDP作成
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // ⑦ OpenAIへ接続
    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview";

    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };

    await pc.setRemoteDescription(answer as RTCSessionDescriptionInit);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Realtime Voice Chat</h1>

      <button onClick={startVoice}>
        🎤 音声開始
      </button>
    </div>
  );
}