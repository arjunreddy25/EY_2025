"""
FastAPI server for Loan Sales Assistant using Agno AgentOS patterns.
Provides WebSocket and HTTP endpoints with async streaming support.
Includes CRM functionality and SMTP email sending.
"""

import asyncio
import json
import os
import re
import smtplib
import traceback
# Ensure uploads directory exists
import pathlib
import shutil
import requests

from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime, timedelta
from dotenv import load_dotenv

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import Groq

from agno.agent import RunEvent
from agno.team.team import TeamRunEvent

from main import loan_sales_team
from db_neon import (
    get_customer,
    get_all_customers,
    get_customer_by_email,
    get_customer_by_phone,
    create_customer_link,
    get_all_links,
    verify_customer_link,
    delete_customer,
    # Chat session operations
    create_chat_session,
    get_chat_sessions,
    get_chat_sessions_by_ids,
    get_chat_session,
    save_chat_message,
    update_session_title,
    delete_chat_session,
    link_sessions_to_customer,
    # Loan tracking operations
    get_loan_applications,
    get_latest_loan_status,
    update_customer_salary_verification,
    get_customer_documents
)

load_dotenv()

# Email Configuration
# Email Configuration - Google Script Relay
GOOGLE_SCRIPT_URL = os.getenv("GOOGLE_SCRIPT_URL")
# Removed SMTP config as we are using Google Script Relay due to blocked ports
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
UPLOADS_DIR = pathlib.Path(__file__).parent.resolve() / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)



# Agent Decision Parser
def parse_agent_decision(content: str) -> dict | None:
    """
    Parse [DECISION: Agent | TYPE | Details | Summary] patterns from agent output.
    Returns dict with agent, decision_type, details, summary or None if not found.
    """
    pattern = r'\[DECISION:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]'
    match = re.search(pattern, content)
    if match:
        return {
            "agent": match.group(1).strip(),
            "decision_type": match.group(2).strip(),
            "details": match.group(3).strip(),
            "summary": match.group(4).strip()
        }
    return None





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


# Chat Session Models
class CreateSessionRequest(BaseModel):
    session_id: str
    customer_id: Optional[str] = None
    title: str = "New Chat"


class SaveMessageRequest(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    tool_calls: Optional[List[dict]] = None


class SessionIdsRequest(BaseModel):
    session_ids: List[str]


class ChatSessionResponse(BaseModel):
    session_id: str
    customer_id: Optional[str] = None
    title: str
    created_at: str
    updated_at: str
    message_count: int
    last_message_preview: Optional[str] = None


def send_via_google_script(to_email: str, customer_name: str, ref_link: str, pre_approved_limit: float, subject: str) -> dict:
    """Send email via Google Apps Script Web App (Bypasses SMTP ports)."""
    print(f"📧 Attempting to send email to: {to_email} via Google Script")
    
    if not GOOGLE_SCRIPT_URL:
        print("❌ GOOGLE_SCRIPT_URL not configured")
        return {"status": "error", "message": "GOOGLE_SCRIPT_URL not configured"}
    
    html_content = f"""
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
        <div style="background: #1a1a2e; color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-weight: 500;">Pre-Approved Personal Loan</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">Exclusive offer for {customer_name}</p>
        </div>
        <div style="background: white; padding: 25px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <p style="margin-top: 0;">Hello {customer_name},</p>
            <p>Great news! Based on your credit profile, you have been <strong>pre-approved</strong> for a personal loan.</p>
            <div style="background: #f8f9fa; border-radius: 6px; padding: 20px; text-align: center; margin: 20px 0;">
                <p style="margin: 0; color: #666; font-size: 14px;">Pre-Approved Amount</p>
                <p style="margin: 8px 0 0 0; color: #1a1a2e; font-size: 28px; font-weight: 600;">Rs. {pre_approved_limit:,.0f}</p>
            </div>
            <p style="font-weight: 500;">What you can do:</p>
            <ul style="padding-left: 20px;">
                <li>Check your exact eligibility</li>
                <li>Calculate EMI for your preferred amount</li>
                <li>Complete instant KYC verification</li>
                <li>Get sanction letter in minutes</li>
            </ul>
            <p style="text-align: center; margin: 25px 0 15px 0;">
                <a href="{ref_link}" style="display: inline-block; background: #1a1a2e; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                    Start Application
                </a>
            </p>
            <p style="font-size: 12px; color: #888; text-align: center; margin-bottom: 0;">This link expires in 24 hours</p>
        </div>
        <p style="font-size: 11px; color: #999; text-align: center; margin-top: 15px;">NBFC Loans | support@nbfc-loans.com</p>
    </body>
    </html>
    """
    
    try:
        response = requests.post(
            GOOGLE_SCRIPT_URL,
            json={
                "to": to_email,
                "subject": subject,
                "htmlBody": html_content
            },
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"✅ Email sent successfully to {to_email}")
            return {"status": "sent", "message": "Email sent successfully"}
        else:
            print(f"❌ Script returned error: {response.text}")
            return {"status": "error", "message": f"Script error: {response.text}"}
            
    except Exception as e:
        print(f"❌ Connection failed to Google Script: {e}")
        return {"status": "error", "message": str(e)}


def build_session_state(customer_id: Optional[str]) -> dict:
    """
    Build session state with customer profile from DB.
    
    NOTE: We only pass 'customer' data here, NOT 'step'.
    Why? Agno MERGES by overwriting matching keys. If we pass step:"sales" every time,
    it would overwrite agent-updated step values (e.g., "verification").
    
    The 'step' field is managed by agents via enable_agentic_state=True.
    """
    session_state = {
        "customer": None,
        # DO NOT include "step" here - agents manage it via agentic_state
    }
    
    if customer_id:
        customer = get_customer(customer_id)
        if customer:
            # Include essential fields plus verification/loan status
            session_state["customer"] = {
                "customer_id": customer.get("customer_id"),
                "name": customer.get("name"),
                "employer": customer.get("employer"),
                "designation": customer.get("designation"),
                "years_employed": customer.get("years_employed"),
                "monthly_salary": customer.get("monthly_salary"),
                "credit_score": customer.get("credit_score"),
                "pre_approved_limit": customer.get("pre_approved_limit"),
                "total_existing_emi": customer.get("total_existing_emi"),
                "kyc_verified": customer.get("kyc_verified"),
                # New: Salary slip verification status
                "salary_slip_verified": customer.get("salary_slip_verified", False),
                "salary_slip_url": customer.get("salary_slip_url"),
            }
            
            # Get latest loan status to include in session state
            latest_loan = get_latest_loan_status(customer_id)
            if latest_loan:
                session_state["customer"]["has_active_loan"] = True
                session_state["customer"]["last_loan_status"] = latest_loan.get("status")
                session_state["customer"]["last_sanction_letter_url"] = latest_loan.get("sanction_letter_url")
            else:
                session_state["customer"]["has_active_loan"] = False
                session_state["customer"]["last_loan_status"] = None
                session_state["customer"]["last_sanction_letter_url"] = None
    
    return session_state


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


# ============================================
# Salary Slip Upload Endpoint
# ============================================

from tools import extract_salary_from_slip
from s3_utils import upload_file_to_s3


@app.post("/upload/salary-slip")
async def upload_salary_slip(
    file: UploadFile = File(...),
    customer_id: Optional[str] = None
):
    """
    Upload a salary slip (PDF or image) for verification.
    Immediately processes with VLM and returns extracted salary data.
    Optionally persists verification status to customer record.
    """
    # Validate file type - Groq Vision only supports images, not PDFs
    allowed_types = {".png", ".jpg", ".jpeg", ".webp"}
    suffix = pathlib.Path(file.filename).suffix.lower()
    if suffix not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_types)}"
        )
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"salary_slip_{customer_id or 'anon'}_{timestamp}{suffix}"
    file_path = UPLOADS_DIR / safe_filename
    
    # Save file locally
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()
    
    print(f"📤 Salary slip uploaded: {file_path}")
    
    # IMMEDIATELY process with VLM to extract salary data
    import json
    extraction_result = extract_salary_from_slip(str(file_path))
    extracted_data = json.loads(extraction_result)
    
    print(f"🔍 VLM extraction result: {extracted_data}")
    
    # Upload to S3 and get URL
    s3_url = upload_file_to_s3(str(file_path), f"salary_slips/{safe_filename}")
    final_url = s3_url if s3_url else f"/uploads/{safe_filename}"
    
    # If extraction successful and customer_id provided, update verification status in DB
    is_verified = extracted_data.get("status") == "success" and extracted_data.get("net_salary")
    if customer_id and is_verified:
        update_customer_salary_verification(customer_id, True, final_url)
        print(f"✅ Salary slip verified for customer {customer_id}")
    
    return {
        "status": "processed",
        "filename": safe_filename,
        "url": final_url,
        "verified": is_verified,
        "extracted": extracted_data
    }


# ============================================
# Customer Loans & Documents Endpoints
# ============================================

@app.get("/customer/{customer_id}/loans")
async def get_customer_loans(customer_id: str):
    """Get all loan applications/sanctions for a customer."""
    customer = get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    loans = get_loan_applications(customer_id)
    
    # Format dates for JSON
    for loan in loans:
        if loan.get("created_at"):
            loan["created_at"] = loan["created_at"].isoformat()
    
    return {
        "customer_id": customer_id,
        "customer_name": customer.get("name"),
        "loans": loans,
        "total_loans": len(loans)
    }


@app.get("/customer/{customer_id}/documents")
async def get_customer_docs(customer_id: str):
    """Get all documents for a customer: salary slips and sanction letters."""
    customer = get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    documents = get_customer_documents(customer_id)
    
    return {
        "customer_id": customer_id,
        "customer_name": customer.get("name"),
        "documents": documents
    }


@app.get("/sanction-letters/{filename}")
async def serve_sanction_letter(filename: str):
    """Serve generated sanction letter PDF files for download."""
    # Use absolute path from current working directory
    import pathlib
    base_dir = pathlib.Path(__file__).parent.resolve()
    filepath = base_dir / "sanction_letters" / filename
    
    print(f"📄 Serving PDF: {filepath}")
    
    if not filepath.exists():
        print(f"❌ PDF not found: {filepath}")
        raise HTTPException(status_code=404, detail="Sanction letter not found")
    
    return FileResponse(
        path=str(filepath),
        media_type="application/pdf",
        filename=filename,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache"
        }
    )


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


class LookupRequest(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None


@app.post("/auth/lookup")
async def lookup_customer(request: LookupRequest):
    """
    Lookup customer by email or phone number.
    Returns customer info if found, or exists=False if not found.
    """
    customer = None
    
    if request.email:
        customer = get_customer_by_email(request.email.strip().lower())
    elif request.phone:
        # Normalize phone (remove spaces, dashes)
        phone = request.phone.strip().replace(" ", "").replace("-", "")
        customer = get_customer_by_phone(phone)
    else:
        raise HTTPException(status_code=400, detail="Email or phone required")
    
    if customer:
        return {
            "exists": True,
            "customer_id": customer["customer_id"],
            "name": customer.get("name"),
            "email": customer.get("email")
        }
    
    return {"exists": False}


# Create KYC uploads directory
KYC_UPLOADS_DIR = pathlib.Path(__file__).parent.resolve() / "uploads" / "kyc"
KYC_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/upload/kyc-document")
async def upload_kyc_document(file: UploadFile = File(...)):
    """
    Upload KYC document (Aadhar, PAN, etc.) for new users.
    Just stores the file - NO processing by agents.
    Used for new customer onboarding before bank KYC.
    """
    # Validate file type
    allowed_types = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}
    suffix = pathlib.Path(file.filename).suffix.lower()
    if suffix not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_types)}"
        )
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"kyc_{timestamp}{suffix}"
    file_path = KYC_UPLOADS_DIR / safe_filename
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()
    
    print(f"📤 KYC document uploaded: {file_path}")
    
    return {
        "status": "uploaded",
        "filename": safe_filename,
        "message": "Document received. Our team will contact you for KYC verification."
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
async def send_customer_email(
    customer_id: str,
    background_tasks: BackgroundTasks,
    subject: str = "Your Pre-Approved Loan Offer is Ready! 🎉"
):
    """
    Generate link and send email to a single customer via SMTP.
    Email is sent in the background for faster response.
    """
    customer = get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    ref_id = create_customer_link(customer_id)
    if not ref_id:
        raise HTTPException(status_code=500, detail="Failed to generate link")
    
    link = f"{FRONTEND_URL}?ref={ref_id}"
    
    # Send email in background - returns immediately to user
    background_tasks.add_task(
        send_via_google_script,
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
        "status": "queued",
        "message": "Email is being sent in the background"
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
            email_result = send_via_google_script(
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


# ============================================
# Chat Session Endpoints
# ============================================

@app.get("/chat/sessions")
async def list_chat_sessions(customer_id: Optional[str] = None):
    """
    List chat sessions.
    - If customer_id is provided, returns sessions for that customer.
    - Otherwise returns all sessions (for admin/debug).
    """
    sessions = get_chat_sessions(customer_id)
    return [
        {
            **s,
            "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
            "updated_at": s["updated_at"].isoformat() if s.get("updated_at") else None,
        }
        for s in sessions
    ]


@app.post("/chat/sessions/by-ids")
async def get_sessions_by_ids(request: SessionIdsRequest):
    """
    Get chat sessions by a list of session IDs.
    Used by anonymous users who track session IDs in localStorage.
    """
    sessions = get_chat_sessions_by_ids(request.session_ids)
    return [
        {
            **s,
            "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
            "updated_at": s["updated_at"].isoformat() if s.get("updated_at") else None,
        }
        for s in sessions
    ]


@app.post("/chat/sessions")
async def create_session(request: CreateSessionRequest):
    """Create a new chat session."""
    session = create_chat_session(
        session_id=request.session_id,
        customer_id=request.customer_id,
        title=request.title
    )
    if not session:
        raise HTTPException(status_code=500, detail="Failed to create session")
    
    return {
        **session,
        "created_at": session["created_at"].isoformat() if session.get("created_at") else None,
        "updated_at": session["updated_at"].isoformat() if session.get("updated_at") else None,
    }


@app.get("/chat/sessions/{session_id}")
async def get_session_with_messages(session_id: str):
    """Get a chat session with all its messages."""
    session = get_chat_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        **session,
        "created_at": session["created_at"].isoformat() if session.get("created_at") else None,
        "updated_at": session["updated_at"].isoformat() if session.get("updated_at") else None,
        "messages": [
            {
                **m,
                "created_at": m["created_at"].isoformat() if m.get("created_at") else None,
            }
            for m in session.get("messages", [])
        ]
    }


@app.delete("/chat/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a chat session and all its messages."""
    success = delete_chat_session(session_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete session")
    return {"status": "deleted", "session_id": session_id}


@app.post("/chat/sessions/{session_id}/messages")
async def save_message(session_id: str, request: SaveMessageRequest):
    """Save a message to a chat session."""
    message = save_chat_message(
        session_id=session_id,
        role=request.role,
        content=request.content,
        tool_calls=request.tool_calls
    )
    if not message:
        raise HTTPException(status_code=500, detail="Failed to save message")
    
    return {
        **message,
        "created_at": message["created_at"].isoformat() if message.get("created_at") else None,
    }


class GenerateTitleRequest(BaseModel):
    message: str


@app.post("/chat/sessions/{session_id}/generate-title")
async def generate_chat_title(session_id: str, request: GenerateTitleRequest):
    """
    Generate an AI-powered title for a chat session based on the first message.
    Uses Groq API directly to create a concise, descriptive title.
    """
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        # Use Groq to generate a title
        prompt = f"""Generate a very short (3-6 words max) title for a chat conversation that starts with this message:

"{request.message}"

Rules:
- Maximum 6 words
- No quotes in the output
- Be descriptive but concise
- Focus on the main topic/intent

Just output the title, nothing else."""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=30,
            temperature=0.5
        )
        
        # Extract title from response
        title = response.choices[0].message.content.strip().strip('"\'')[:50]
        
        print(f"✅ Generated title: '{title}' for session {session_id}")
        
        # Update session title in database
        if title and len(title) > 3:
            update_session_title(session_id, title)
            return {"title": title, "session_id": session_id}
        else:
            raise ValueError("AI returned invalid title")
            
    except Exception as e:
        print(f"❌ Error generating title: {e}")
        traceback.print_exc()
        # Fall back to truncated message
        fallback = request.message[:40] + "..." if len(request.message) > 40 else request.message
        update_session_title(session_id, fallback)
        return {"title": fallback, "session_id": session_id}


@app.post("/chat/sessions/link-to-customer")
async def link_sessions_to_customer_endpoint(customer_id: str, request: SessionIdsRequest):
    """
    Link anonymous sessions to a customer after verification.
    Used when a user verifies via ref link and we want to associate their previous chats.
    """
    count = link_sessions_to_customer(request.session_ids, customer_id)
    return {"linked_count": count, "customer_id": customer_id}


@app.post("/chat")
async def chat_endpoint(chat: ChatMessage):
    """
    HTTP endpoint for chat (non-streaming).
    For streaming, use WebSocket endpoint /ws/chat or SSE endpoint /chat/stream.
    """
    try:
        # Build session state with customer profile
        session_state = build_session_state(chat.customer_id)
        
        # Use arun() directly for async execution
        response = await loan_sales_team.arun(
            chat.message,  # Plain message, no context prepend
            stream=False,
            session_id=chat.session_id,
            session_state=session_state  # Customer data injected here
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
    
    # Build session state with customer profile
    session_state = build_session_state(customer_id)
    
    async def event_generator():
        try:
            content_started = False
            
            # Use arun() directly - no threading needed! Members run concurrently
            async for run_output_event in loan_sales_team.arun(
                message,  # Plain message
                stream=True,
                stream_events=True,
                session_id=session_id,
                session_state=session_state  # Customer data injected here
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
            
            # Build session state with customer profile
            session_state = build_session_state(customer_id)
            
            # Send acknowledgment
            await websocket.send_json({
                "type": "ack",
                "message": "Processing..."
            })
            
            print(f"📨 WebSocket received message: '{user_message[:50]}...' for session: {session_id}")
            
            # Stream response using async generator
            content_started = False
            
            try:
                print(f"🚀 Starting loan_sales_team.arun() for session: {session_id}")
                # Use arun() directly - no threading needed! Members run concurrently
                async for run_output_event in loan_sales_team.arun(
                    user_message,  # Plain message
                    stream=True,
                    stream_events=True,
                    session_id=session_id,
                    session_state=session_state  # Customer data injected here
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
                        result_str = getattr(run_output_event.tool, 'result', '')
                        
                        await websocket.send_json({
                            "type": "member_tool_complete",
                            "agent": agent_id,
                            "tool": tool_name
                        })
                        
                        # Parse tool results and emit agent_decision events
                        if result_str:
                            try:
                                result_data = json.loads(result_str)
                                
                                # EMI Calculation completed (Sales Agent)
                                if tool_name == 'calculate_emi':
                                    await websocket.send_json({
                                        "type": "agent_decision",
                                        "agent": "Sales Agent",
                                        "decision_type": "EMI_CALCULATED",
                                        "details": f"Amount: ₹{result_data.get('loan_amount'):,.0f}, Tenure: {result_data.get('tenure_months')} months, EMI: ₹{result_data.get('monthly_emi'):,.0f}",
                                        "summary": "EMI calculation complete"
                                    })
                                
                                # KYC Verification completed
                                elif tool_name == 'fetch_kyc_from_crm':
                                    status = result_data.get('status', 'error')
                                    if status == 'success' and result_data.get('kyc_verified'):
                                        await websocket.send_json({
                                            "type": "agent_decision",
                                            "agent": "Verification Agent",
                                            "decision_type": "KYC_VERIFIED",
                                            "details": f"Customer: {result_data.get('name', 'Unknown')}, Phone & Address verified",
                                            "summary": "Identity verification passed"
                                        })
                                    elif status == 'success' and not result_data.get('kyc_verified'):
                                        await websocket.send_json({
                                            "type": "agent_decision",
                                            "agent": "Verification Agent",
                                            "decision_type": "KYC_FAILED",
                                            "details": "KYC documents not verified",
                                            "summary": "Identity verification failed"
                                        })
                                
                                # Loan Eligibility validated
                                elif tool_name == 'validate_loan_eligibility':
                                    status = result_data.get('status', '')
                                    if status == 'approved':
                                        await websocket.send_json({
                                            "type": "agent_decision",
                                            "agent": "Underwriting Agent",
                                            "decision_type": "APPROVED",
                                            "details": f"Amount: ₹{result_data.get('approved_amount'):,.0f} at {result_data.get('interest_rate')}% interest",
                                            "summary": "Loan approved - proceed to sanction"
                                        })
                                    elif status == 'conditional_approval':
                                        await websocket.send_json({
                                            "type": "agent_decision",
                                            "agent": "Underwriting Agent",
                                            "decision_type": "CONDITIONAL",
                                            "details": f"Requires: {result_data.get('requires', 'salary_slip_upload')}",
                                            "summary": "Conditional approval - salary slip required"
                                        })
                                    elif status == 'rejected':
                                        await websocket.send_json({
                                            "type": "agent_decision",
                                            "agent": "Underwriting Agent",
                                            "decision_type": "REJECTED",
                                            "details": f"Reason: {result_data.get('reason', 'Unknown')}",
                                            "summary": "Loan application rejected"
                                        })
                                
                                # Sanction letter generated
                                elif tool_name == 'generate_sanction_letter':
                                    if result_data.get("status") == "generated":
                                        await websocket.send_json({
                                            "type": "agent_decision",
                                            "agent": "Sanction Agent",
                                            "decision_type": "SANCTION_GENERATED",
                                            "details": f"Letter ID: {result_data.get('letter_id')}, Amount: ₹{result_data.get('sanctioned_amount'):,.0f}",
                                            "summary": "Sanction letter PDF created"
                                        })
                                        await websocket.send_json({
                                            "type": "sanction_letter",
                                            "letter_id": result_data.get("letter_id"),
                                            "pdf_url": f"http://localhost:8000{result_data.get('pdf_url')}",
                                            "customer_name": result_data.get("customer_name"),
                                            "sanctioned_amount": result_data.get("sanctioned_amount")
                                        })
                            except (json.JSONDecodeError, TypeError, KeyError) as e:
                                print(f"⚠️ Error parsing tool result: {e}")
                                pass
                
                # Send completion signal
                print(f"✅ Response completed for session: {session_id}")
                await websocket.send_json({
                    "type": "done"
                })
            
            except Exception as e:
                print(f"❌ Error in arun(): {e}")
                import traceback
                traceback.print_exc()
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
    
    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnected for session: {session_id}")
        manager.disconnect(session_id)
    except Exception as e:
        print(f"💥 WebSocket exception: {e}")
        manager.disconnect(session_id)
        raise




# Mount uploads folder for static file serving (at end to avoid route conflicts)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

