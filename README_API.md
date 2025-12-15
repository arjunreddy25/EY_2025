# Loan Sales Assistant API Server

FastAPI server exposing the Loan Sales Assistant Team via WebSocket and HTTP endpoints with real-time token streaming.

## Features

- ✅ **WebSocket Support**: Real-time bidirectional communication with token-by-token streaming
- ✅ **Server-Sent Events (SSE)**: HTTP streaming endpoint for SSE-compatible clients
- ✅ **Event Streaming**: Full event streaming support (content, tool calls, member events)
- ✅ **Zero Latency**: Async architecture prevents blocking and latency buildup
- ✅ **Session Management**: Per-session conversation context
- ✅ **CORS Enabled**: Ready for web frontend integration

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Start the API Server

```bash
# Default port 8000
python api_server.py

# Or with uvicorn
uvicorn api_server:app --host 0.0.0.0 --port 8000
```

### 3. Start CRM Server (Required)

```bash
# In a separate terminal
uvicorn crm_server:app --port 8001
```

## API Endpoints

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "loan-sales-assistant"
}
```

### HTTP Chat (Non-streaming)

```bash
POST /chat
Content-Type: application/json

{
  "message": "I want to apply for a loan",
  "session_id": "user123"
}
```

Response:
```json
{
  "response": "Hello! I'd be happy to help...",
  "session_id": "user123"
}
```

### Server-Sent Events (SSE) Streaming

```bash
GET /chat/stream?message=hello&session_id=user123
```

Streams events in SSE format:
```
data: {"type": "content_start"}

data: {"type": "content", "data": "H"}

data: {"type": "content", "data": "e"}

data: {"type": "content", "data": "l"}
...
```

### WebSocket Chat (Recommended)

Connect to: `ws://localhost:8000/ws/chat?session_id=user123`

**Send Message:**
```json
{
  "message": "I want to apply for a loan"
}
```

**Receive Events:**
```json
{"type": "ack", "message": "Processing..."}
{"type": "content_start"}
{"type": "content", "data": "H"}
{"type": "content", "data": "e"}
{"type": "content", "data": "l"}
{"type": "tool_start", "tool": "fetch_preapproved_offer"}
{"type": "tool_complete", "tool": "fetch_preapproved_offer"}
{"type": "content", "data": "l"}
...
{"type": "done"}
```

## Event Types

### Content Events
- `content_start`: Streaming started
- `content`: Token/chunk of content (streams in real-time)
- `done`: Streaming completed

### Tool Events
- `tool_start`: Tool execution started
- `tool_complete`: Tool execution completed (with result preview)
- `member_tool_start`: Member agent tool started
- `member_tool_complete`: Member agent tool completed

### Error Events
- `error`: Error occurred with message

## WebSocket Client Example (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/chat?session_id=user123');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    message: "I want to apply for a loan"
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'content':
      // Append token to UI
      appendToChat(data.data);
      break;
    case 'tool_start':
      console.log(`Tool started: ${data.tool}`);
      break;
    case 'done':
      console.log('Response complete');
      break;
  }
};
```

## Performance Considerations

- **Async Architecture**: Uses threading to bridge sync Agno Team to async FastAPI
- **Zero Blocking**: Events stream immediately without buffering
- **Low Latency**: Token-by-token streaming with minimal delay
- **Concurrent Connections**: Supports multiple WebSocket connections simultaneously

## Environment Variables

```bash
PORT=8000  # API server port (default: 8000)
GROQ_API_KEY=your_key  # Required for Agno Team
```

## Architecture

```
┌─────────────┐
│ Web Client  │
└──────┬──────┘
       │ WebSocket/SSE/HTTP
       │
┌──────▼──────────────────┐
│  FastAPI API Server     │
│  (api_server.py)        │
│  - WebSocket Handler    │
│  - SSE Handler          │
│  - HTTP Handler         │
└──────┬──────────────────┘
       │
┌──────▼──────────┐
│  Agno Team      │
│  (Master-Worker)│
└─────────────────┘
```

## Testing

### Test WebSocket with curl

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c "ws://localhost:8000/ws/chat?session_id=test123"

# Send message
{"message": "Hello"}
```

### Test SSE with curl

```bash
curl -N "http://localhost:8000/chat/stream?message=hello&session_id=test123"
```

### Test HTTP endpoint

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "session_id": "test123"}'
```

## Production Deployment

1. **Use Production ASGI Server**:
   ```bash
   uvicorn api_server:app --host 0.0.0.0 --port 8000 --workers 4
   ```

2. **Add Reverse Proxy** (nginx):
   ```nginx
   location /ws/chat {
       proxy_pass http://localhost:8000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```

3. **Enable CORS Properly**:
   Update `allow_origins` in `api_server.py` to your domain

4. **Add Authentication**:
   Implement JWT or session-based auth in WebSocket handler

5. **Rate Limiting**:
   Add rate limiting middleware for production

## Troubleshooting

### WebSocket connection fails
- Check firewall settings
- Verify port 8000 is accessible
- Check CORS settings

### No streaming / tokens not appearing
- Verify `stream_events=True` is set
- Check that CRM server is running
- Review server logs for errors

### High latency
- Check network connection
- Verify Groq API key is valid
- Monitor server resources (CPU/memory)

