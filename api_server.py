"""
FastAPI server for Loan Sales Assistant using Agno AgentOS patterns.
Provides WebSocket and HTTP endpoints with async streaming support.
Includes CRM functionality and SMTP email sending.
"""

import asyncio
import json
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime, timedelta
from dotenv import load_dotenv

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agno.agent import RunEvent
from agno.team.team import TeamRunEvent

from main import loan_sales_team
from db_neon import (
    get_customer,
    get_all_customers,
    create_customer_link,
    get_all_links,
    verify_customer_link,
    delete_customer
)

load_dotenv()

# Email Configuration
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_EMAIL = os.getenv("SMTP_EMAIL")
APP_PASSWORD = os.getenv("APP_PASSWORD")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")





class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = "default_session"
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str


class CustomerSummary(BaseModel):
    customer_id: str
    name: str
    email: str
    phone: str
    city: str
    credit_score: int
    pre_approved_limit: float


class LinkResponse(BaseModel):
    ref_id: str
    link: str
    customer_id: str
    customer_name: str
    expires_at: str


class SendEmailRequest(BaseModel):
    customer_ids: Optional[List[str]] = None
    subject: Optional[str] = "Your Pre-Approved Loan Offer is Ready! 🎉"


class DeleteCustomersRequest(BaseModel):
    customer_ids: List[str]


class EmailResult(BaseModel):
    customer_id: str
    email: str
    status: str
    message: Optional[str] = None


def send_smtp_email(to_email: str, customer_name: str, ref_link: str, pre_approved_limit: float, subject: str) -> dict:
    """Send email via SMTP with Gmail App Password."""
    if not SMTP_EMAIL or not APP_PASSWORD:
        return {"status": "error", "message": "SMTP_EMAIL or APP_PASSWORD not configured"}
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1>🎉 Great News, {customer_name}!</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Hi {customer_name},</p>
            <p>We're excited to inform you that you've been <strong>pre-approved</strong> for a personal loan!</p>
            <p style="color: #667eea; font-weight: bold; font-size: 24px;">Up to ₹{pre_approved_limit:,.0f}</p>
            <p>Our AI-powered loan assistant is ready to help you:</p>
            <ul>
                <li>✅ Check your exact eligibility</li>
                <li>✅ Calculate EMI for your desired amount</li>
                <li>✅ Complete instant KYC verification</li>
                <li>✅ Get your sanction letter in minutes</li>
            </ul>
            <p style="text-align: center;">
                <a href="{ref_link}" style="display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Start Your Application →
                </a>
            </p>
            <p style="font-size: 12px; color: #666;">This link is valid for 24 hours.</p>
        </div>
    </body>
    </html>
    """
    
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_EMAIL
        msg["To"] = to_email
        
        msg.attach(MIMEText(html_content, "html"))
        
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, APP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        
        return {"status": "sent", "message": "Email sent successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def build_context_message(message: str, customer_id: Optional[str], customer_name: Optional[str]) -> str:
    """Inject customer context into the message for the agents."""
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
    customer = verify_customer_link(ref)
    if not customer:
        raise HTTPException(status_code=401, detail="Invalid or expired link")
    
    return {
        "customer_id": customer["customer_id"],
        "email": customer["email"],
        "name": customer["name"]
    }


# ============================================
# CRM Endpoints
# ============================================

@app.get("/crm/customers", response_model=List[CustomerSummary])
async def list_customers():
    """List all customers with summary info (optimized batch query)."""
    customers = get_all_customers()
    
    return [
        CustomerSummary(
            customer_id=cid,
            name=c.get("name", ""),
            email=c.get("email", ""),
            phone=c.get("phone", ""),
            city=c.get("city", ""),
            credit_score=c.get("credit_score", 0),
            pre_approved_limit=c.get("pre_approved_limit", 0)
        )
        for cid, c in customers.items()
    ]


@app.get("/crm/customers/{customer_id}")
async def get_customer_details(customer_id: str):
    """Get full customer details."""
    customer = get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@app.post("/crm/generate-link/{customer_id}", response_model=LinkResponse)
async def generate_customer_link_endpoint(customer_id: str, expires_hours: int = 24):
    """Generate a unique reference link for a customer."""
    customer = get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    ref_id = create_customer_link(customer_id, expires_hours)
    if not ref_id:
        raise HTTPException(status_code=500, detail="Failed to generate link")
    
    expires_at = datetime.now() + timedelta(hours=expires_hours)
    
    return LinkResponse(
        ref_id=ref_id,
        link=f"{FRONTEND_URL}?ref={ref_id}",
        customer_id=customer_id,
        customer_name=customer.get("name", ""),
        expires_at=expires_at.isoformat()
    )


@app.post("/crm/send-email/{customer_id}")
async def send_customer_email(customer_id: str, subject: str = "Your Pre-Approved Loan Offer is Ready! 🎉"):
    """Generate link and send email to a single customer via SMTP."""
    customer = get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    ref_id = create_customer_link(customer_id)
    if not ref_id:
        raise HTTPException(status_code=500, detail="Failed to generate link")
    
    link = f"{FRONTEND_URL}?ref={ref_id}"
    
    result = send_smtp_email(
        to_email=customer.get("email"),
        customer_name=customer.get("name", "Customer"),
        ref_link=link,
        pre_approved_limit=customer.get("pre_approved_limit", 0),
        subject=subject
    )
    
    return {
        "customer_id": customer_id,
        "email": customer.get("email"),
        "link": link,
        "ref_id": ref_id,
        **result
    }


@app.post("/crm/delete-customers")
async def delete_customers_endpoint(request: DeleteCustomersRequest):
    """Delete multiple customers and their related data."""
    if not request.customer_ids:
        return {"deleted": 0, "failed": 0, "details": []}
    
    deleted_count = 0
    failed_count = 0
    details = []
    
    for customer_id in request.customer_ids:
        try:
            success = delete_customer(customer_id)
            if success:
                deleted_count += 1
                details.append({"customer_id": customer_id, "status": "deleted"})
            else:
                failed_count += 1
                details.append({"customer_id": customer_id, "status": "failed", "error": "Database error"})
        except Exception as e:
            failed_count += 1
            details.append({"customer_id": customer_id, "status": "failed", "error": str(e)})
            
    return {
        "deleted": deleted_count,
        "failed": failed_count,
        "details": details
    }


@app.post("/crm/send-batch-emails")
async def send_batch_emails(request: SendEmailRequest = None):
    """Send emails to multiple customers (or all if none specified)."""
    customer_ids = request.customer_ids if request and request.customer_ids else None
    subject = request.subject if request else "Your Pre-Approved Loan Offer is Ready! 🎉"
    
    if customer_ids is None:
        customers = get_all_customers()
        customer_ids = list(customers.keys())
    
    results = []
    sent_count = 0
    failed_count = 0
    
    for customer_id in customer_ids:
        try:
            customer = get_customer(customer_id)
            if not customer:
                results.append({"customer_id": customer_id, "status": "failed", "message": "Customer not found"})
                failed_count += 1
                continue
            
            ref_id = create_customer_link(customer_id)
            if not ref_id:
                results.append({"customer_id": customer_id, "status": "failed", "message": "Failed to generate link"})
                failed_count += 1
                continue
            
            link = f"{FRONTEND_URL}?ref={ref_id}"
            email_result = send_smtp_email(
                to_email=customer.get("email"),
                customer_name=customer.get("name", "Customer"),
                ref_link=link,
                pre_approved_limit=customer.get("pre_approved_limit", 0),
                subject=subject
            )
            
            results.append({
                "customer_id": customer_id,
                "email": customer.get("email"),
                "link": link,
                **email_result
            })
            
            if email_result["status"] == "sent":
                sent_count += 1
            else:
                failed_count += 1
                
        except Exception as e:
            results.append({"customer_id": customer_id, "status": "failed", "message": str(e)})
            failed_count += 1
    
    return {
        "total": len(customer_ids),
        "sent": sent_count,
        "failed": failed_count,
        "results": results
    }


@app.get("/crm/links")
async def list_all_links():
    """Get all generated customer links."""
    links = get_all_links()
    
    return [
        {
            "ref_id": link["ref_id"],
            "customer_id": link["customer_id"],
            "customer_name": link.get("name", ""),
            "customer_email": link.get("email", ""),
            "link": f"{FRONTEND_URL}?ref={link['ref_id']}",
            "created_at": link["created_at"].isoformat() if link.get("created_at") else None,
            "expires_at": link["expires_at"].isoformat() if link.get("expires_at") else None,
            "used": link.get("used", False),
            "used_at": link["used_at"].isoformat() if link.get("used_at") else None
        }
        for link in links
    ]


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

