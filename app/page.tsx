"use client";

export default function Home() {

  const startVoice = async () => {
    // ① トークン取得
    const tokenRes = await fetch(
      "https://realtime-api-backend-g6f4ddfzh3dsc9fa.japanwest-01.azurewebsites.net/realtime/session",
      { method: "POST" }
    );

    const tokenData = await tokenRes.json();

    const EPHEMERAL_KEY = tokenData.client_secret.value;

    // ② PeerConnection
    const pc = new RTCPeerConnection();

    // 🎤 マイク取得
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // 🔊 音声受信
    pc.ontrack = (event) => {
      const audio = document.createElement("audio");
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
    };

    // 📡 DataChannel
    const dc = pc.createDataChannel("oai-events");

    dc.onmessage = (e) => {
      console.log("AI:", e.data);
    };

    // ③ Offer作成
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // ④ OpenAIに送信
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

    // ⑤ Answer設定
    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerSDP,
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Realtime Voice AI 🎤</h1>
      <button onClick={startVoice}>
        音声開始
      </button>
    </div>
  );
}