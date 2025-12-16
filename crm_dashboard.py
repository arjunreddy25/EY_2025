"""
CRM Dashboard API Server
Provides endpoints for managing customers and sending email links.
Run on port 8002.
"""

import os
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db_neon import (
    get_customer,
    get_all_customers,
    create_customer_link,
    get_all_links
)


class LinkResponse(BaseModel):
    ref_id: str
    link: str
    customer_id: str
    customer_name: str
    expires_at: str


class CustomerSummary(BaseModel):
    customer_id: str
    name: str
    email: str
    phone: str
    city: str
    credit_score: int
    pre_approved_limit: float


class SendEmailRequest(BaseModel):
    subject: Optional[str] = "Your Pre-Approved Loan Offer is Ready!"
    message: Optional[str] = None


app = FastAPI(
    title="CRM Dashboard API",
    description="CRM for managing customers and sending personalized email links",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Frontend URL for generating links
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "crm-dashboard"}


@app.get("/customers", response_model=List[CustomerSummary])
async def list_customers():
    """List all customers with summary info."""
    customers = get_all_customers()
    
    result = []
    for customer_id, customer in customers.items():
        result.append(CustomerSummary(
            customer_id=customer_id,
            name=customer.get("name", ""),
            email=customer.get("email", ""),
            phone=customer.get("phone", ""),
            city=customer.get("city", ""),
            credit_score=customer.get("credit_score", 0),
            pre_approved_limit=customer.get("pre_approved_limit", 0)
        ))
    
    return result


@app.get("/customers/{customer_id}")
async def get_customer_details(customer_id: str):
    """Get full customer details."""
    customer = get_customer(customer_id)
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return customer


@app.post("/generate-link/{customer_id}", response_model=LinkResponse)
async def generate_customer_link(customer_id: str, expires_hours: int = 24):
    """
    Generate a unique reference link for a customer.
    This link can be sent via email to redirect them to the chatbot.
    """
    customer = get_customer(customer_id)
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    ref_id = create_customer_link(customer_id, expires_hours)
    
    if not ref_id:
        raise HTTPException(status_code=500, detail="Failed to generate link")
    
    from datetime import timedelta
    expires_at = datetime.now() + timedelta(hours=expires_hours)
    
    return LinkResponse(
        ref_id=ref_id,
        link=f"{FRONTEND_URL}?ref={ref_id}",
        customer_id=customer_id,
        customer_name=customer.get("name", ""),
        expires_at=expires_at.isoformat()
    )


@app.post("/send-email/{customer_id}")
async def send_customer_email(customer_id: str, request: SendEmailRequest = None):
    """
    Generate a link and simulate sending an email to the customer.
    In production, integrate with Resend/SendGrid/AWS SES.
    """
    customer = get_customer(customer_id)
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Generate the link
    ref_id = create_customer_link(customer_id)
    
    if not ref_id:
        raise HTTPException(status_code=500, detail="Failed to generate link")
    
    link = f"{FRONTEND_URL}?ref={ref_id}"
    
    # Email content
    subject = request.subject if request else "Your Pre-Approved Loan Offer is Ready!"
    
    email_body = f"""
    Hi {customer.get('name', 'Customer')},
    
    Great news! You have a pre-approved personal loan offer of up to ₹{customer.get('pre_approved_limit', 0):,.0f}.
    
    Click the link below to speak with our AI assistant and complete your application in minutes:
    
    {link}
    
    This link is valid for 24 hours.
    
    Best regards,
    Your Loan Team
    """
    
    # TODO: In production, send actual email using Resend/SendGrid
    # For now, we just log and return the email content
    print(f"\n{'='*50}")
    print(f"📧 EMAIL TO: {customer.get('email')}")
    print(f"📧 SUBJECT: {subject}")
    print(f"📧 BODY:\n{email_body}")
    print(f"{'='*50}\n")
    
    return {
        "status": "sent",
        "customer_id": customer_id,
        "email": customer.get("email"),
        "subject": subject,
        "link": link,
        "ref_id": ref_id,
        "message": "Email simulated (check server console). In production, integrate with email service."
    }


@app.post("/send-bulk-emails")
async def send_bulk_emails(customer_ids: List[str] = None):
    """
    Send emails to multiple customers (or all if none specified).
    """
    if customer_ids is None:
        customers = get_all_customers()
        customer_ids = list(customers.keys())
    
    results = []
    for customer_id in customer_ids:
        try:
            result = await send_customer_email(customer_id)
            results.append({"customer_id": customer_id, "status": "sent", "link": result["link"]})
        except HTTPException as e:
            results.append({"customer_id": customer_id, "status": "failed", "error": e.detail})
    
    return {
        "total": len(customer_ids),
        "sent": len([r for r in results if r["status"] == "sent"]),
        "failed": len([r for r in results if r["status"] == "failed"]),
        "results": results
    }


@app.get("/links")
async def list_all_links():
    """Get all generated customer links (for tracking/debugging)."""
    links = get_all_links()
    
    # Format for display
    formatted_links = []
    for link in links:
        formatted_links.append({
            "ref_id": link["ref_id"],
            "customer_id": link["customer_id"],
            "customer_name": link.get("name", ""),
            "customer_email": link.get("email", ""),
            "link": f"{FRONTEND_URL}?ref={link['ref_id']}",
            "created_at": link["created_at"].isoformat() if link.get("created_at") else None,
            "expires_at": link["expires_at"].isoformat() if link.get("expires_at") else None,
            "used": link.get("used", False),
            "used_at": link["used_at"].isoformat() if link.get("used_at") else None
        })
    
    return formatted_links


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("CRM_PORT", 8002))
    print(f"\n🚀 Starting CRM Dashboard on port {port}")
    print(f"📊 API Docs: http://localhost:{port}/docs")
    print(f"🔗 Frontend URL: {FRONTEND_URL}\n")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
