const wsUrl = `wss://realtime-api-backend-g6f4ddfzh3dsc9fa.japanwest-01.azurewebsites.net`;
const ws = new WebSocket(wsUrl);
socketRef.current = ws;

ws.onopen = () => {
  setStatus("connected");
  addLog("✅ Gemini Live 接続成功");
  // setupメッセージはバックエンドが送るので不要
};