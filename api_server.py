"""
FastAPI server for Loan Sales Assistant using Agno AgentOS patterns.
Provides WebSocket and HTTP endpoints with async streaming support.
"""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agno.agent import RunEvent
from agno.team.team import TeamRunEvent

from main import loan_sales_team


class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = "default_session"
    customer_id: Optional[str] = None  # From localStorage after ref link auth
    customer_name: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str


def build_context_message(message: str, customer_id: Optional[str], customer_name: Optional[str]) -> str:
    """
    Inject customer context into the message for the agents.
    This way agents know who they're talking to without asking.
    """
    if customer_id and customer_name:
        return f"[SYSTEM CONTEXT: Customer identified - ID: {customer_id}, Name: {customer_name}. Do NOT ask for customer ID - you already have it. Use this ID for all tool calls.]\n\nCustomer says: {message}"
    elif customer_id:
        return f"[SYSTEM CONTEXT: Customer identified - ID: {customer_id}. Do NOT ask for customer ID - you already have it. Use this ID for all tool calls.]\n\nCustomer says: {message}"
    else:
        return message


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    yield


app = FastAPI(
    title="Loan Sales Assistant API",
    description="Multi-agent loan sales assistant with streaming support",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    """Manages WebSocket connections."""
    
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
    
    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
    
    async def send_personal_message(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(message)
            except Exception:
                self.disconnect(session_id)


manager = ConnectionManager()


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="healthy", service="loan-sales-assistant")


@app.get("/auth/verify-ref")
async def verify_reference_link(ref: str):
    """
    Verify reference link from CRM email and return customer identity.
    Frontend stores this in localStorage for chatbot personalization.
    """
    from db_neon import verify_customer_link
    
    customer = verify_customer_link(ref)
    if not customer:
        raise HTTPException(status_code=401, detail="Invalid or expired link")
    
    return {
        "customer_id": customer["customer_id"],
        "email": customer["email"],
        "name": customer["name"]
    }


@app.post("/chat")
async def chat_endpoint(chat: ChatMessage):
    """
    HTTP endpoint for chat (non-streaming).
    For streaming, use WebSocket endpoint /ws/chat or SSE endpoint /chat/stream.
    """
    try:
        # Build message with customer context
        contextualized_message = build_context_message(
            chat.message, chat.customer_id, chat.customer_name
        )
        
        # Use arun() directly for async execution
        response = await loan_sales_team.arun(
            contextualized_message,
            stream=False,
            session_id=chat.session_id
        )
        return {
            "response": response.content if hasattr(response, 'content') else str(response),
            "session_id": chat.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chat/stream")
async def chat_stream_endpoint(
    message: str, 
    session_id: str = "default_session",
    customer_id: Optional[str] = None,
    customer_name: Optional[str] = None
):
    """
    Server-Sent Events (SSE) endpoint for streaming responses.
    Usage: GET /chat/stream?message=hello&session_id=abc123&customer_id=CUST001&customer_name=John
    """
    
    # Build contextualized message
    contextualized_message = build_context_message(message, customer_id, customer_name)
    
    async def event_generator():
        try:
            content_started = False
            
            # Use arun() directly - no threading needed! Members run concurrently
            # arun() returns an async generator, so we iterate directly without await
            async for run_output_event in loan_sales_team.arun(
                contextualized_message,
                stream=True,
                stream_events=True,
                session_id=session_id
            ):
                # Stream content tokens
                if run_output_event.event == TeamRunEvent.run_content:
                    if hasattr(run_output_event, 'content') and run_output_event.content:
                        if not content_started:
                            yield f"data: {json.dumps({'type': 'content_start'})}\n\n"
                            content_started = True
                        yield f"data: {json.dumps({'type': 'content', 'data': run_output_event.content})}\n\n"
                
                # Stream tool call events
                elif run_output_event.event == TeamRunEvent.tool_call_started:
                    tool_name = getattr(run_output_event.tool, 'tool_name', 'unknown')
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name})}\n\n"
                
                elif run_output_event.event == TeamRunEvent.tool_call_completed:
                    tool_name = getattr(run_output_event.tool, 'tool_name', 'unknown')
                    result = getattr(run_output_event.tool, 'result', '')
                    yield f"data: {json.dumps({'type': 'tool_complete', 'tool': tool_name, 'result': str(result)[:100]})}\n\n"
                
                # Stream member agent tool events
                elif run_output_event.event == RunEvent.tool_call_started:
                    agent_id = getattr(run_output_event, 'agent_id', 'unknown')
                    tool_name = getattr(run_output_event.tool, 'tool_name', 'unknown')
                    yield f"data: {json.dumps({'type': 'member_tool_start', 'agent': agent_id, 'tool': tool_name})}\n\n"
                
                elif run_output_event.event == RunEvent.tool_call_completed:
                    agent_id = getattr(run_output_event, 'agent_id', 'unknown')
                    tool_name = getattr(run_output_event.tool, 'tool_name', 'unknown')
                    yield f"data: {json.dumps({'type': 'member_tool_complete', 'agent': agent_id, 'tool': tool_name})}\n\n"
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, session_id: str = "default_session"):
    """
    WebSocket endpoint for real-time bidirectional chat with token streaming.
    Connect: ws://localhost:8000/ws/chat?session_id=abc123
    """
    await manager.connect(websocket, session_id)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)
            user_message = message_data.get("message", "")
            customer_id = message_data.get("customer_id")
            customer_name = message_data.get("customer_name")
            
            if not user_message:
                await websocket.send_json({
                    "type": "error",
                    "message": "Message is required"
                })
                continue
            
            # Build contextualized message with customer info
            contextualized_message = build_context_message(user_message, customer_id, customer_name)
            
            # Send acknowledgment
            await websocket.send_json({
                "type": "ack",
                "message": "Processing..."
            })
            
            # Stream response using async generator
            content_started = False
            
            try:
                # Use arun() directly - no threading needed! Members run concurrently
                # arun() returns an async generator, so we iterate directly without await
                async for run_output_event in loan_sales_team.arun(
                    contextualized_message,
                    stream=True,
                    stream_events=True,
                    session_id=session_id
                ):
                    # Stream content tokens in real-time
                    if run_output_event.event == TeamRunEvent.run_content:
                        if hasattr(run_output_event, 'content') and run_output_event.content:
                            if not content_started:
                                await websocket.send_json({
                                    "type": "content_start"
                                })
                                content_started = True
                            
                            # Send token immediately for real-time streaming
                            await websocket.send_json({
                                "type": "content",
                                "data": run_output_event.content
                            })
                    
                    # Stream team-level tool events
                    elif run_output_event.event == TeamRunEvent.tool_call_started:
                        tool_name = getattr(run_output_event.tool, 'tool_name', 'unknown')
                        await websocket.send_json({
                            "type": "tool_start",
                            "tool": tool_name
                        })
                    
                    elif run_output_event.event == TeamRunEvent.tool_call_completed:
                        tool_name = getattr(run_output_event.tool, 'tool_name', 'unknown')
                        result = getattr(run_output_event.tool, 'result', '')
                        await websocket.send_json({
                            "type": "tool_complete",
                            "tool": tool_name,
                            "result": str(result)[:100] if result else ""
                        })
                    
                    # Stream member agent tool events
                    elif run_output_event.event == RunEvent.tool_call_started:
                        agent_id = getattr(run_output_event, 'agent_id', 'unknown')
                        tool_name = getattr(run_output_event.tool, 'tool_name', 'unknown')
                        await websocket.send_json({
                            "type": "member_tool_start",
                            "agent": agent_id,
                            "tool": tool_name
                        })
                    
                    elif run_output_event.event == RunEvent.tool_call_completed:
                        agent_id = getattr(run_output_event, 'agent_id', 'unknown')
                        tool_name = getattr(run_output_event.tool, 'tool_name', 'unknown')
                        await websocket.send_json({
                            "type": "member_tool_complete",
                            "agent": agent_id,
                            "tool": tool_name
                        })
                
                # Send completion signal
                await websocket.send_json({
                    "type": "done"
                })
            
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
    
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        manager.disconnect(session_id)
        raise


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

