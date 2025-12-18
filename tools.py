# tools.py
from agno.tools import tool
import json
import os
import requests
import base64
from pathlib import Path
from datetime import datetime
from db_neon import get_all_customers, create_loan_application
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from s3_utils import upload_file_to_s3

# Groq VLM for salary slip extraction
from groq import Groq
from dotenv import load_dotenv
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def extract_salary_from_slip(file_path: str) -> str:
    """
    Extract salary details from an uploaded salary slip (PDF or image).
    Uses Groq Vision (Llama 4 Scout) to read and parse the document.
    Returns extracted net salary, employer name, and pay period.
    """
    file_path = Path(file_path)
    
    # For local paths, check if file exists
    if not file_path.exists():
        # Try looking in uploads directory
        uploads_dir = Path(__file__).parent / "uploads"
        possible_path = uploads_dir / file_path.name
        if possible_path.exists():
            file_path = possible_path
        else:
            return json.dumps({
                "status": "error",
                "message": f"File not found: {file_path}"
            })
    
    # Read and encode file content
    try:
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        base64_image = base64.b64encode(file_bytes).decode('utf-8')
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": f"Failed to read file: {str(e)}"
        })
    
    # Determine MIME type
    suffix = file_path.suffix.lower()
    mime_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    }
    mime_type = mime_types.get(suffix, "image/jpeg")
    
    # Note: Groq Vision doesn't support PDFs directly, only images
    if suffix == ".pdf":
        return json.dumps({
            "status": "error",
            "message": "PDF files not supported. Please upload an image (PNG, JPG, JPEG)."
        })
    
    # Use Groq Vision API
    try:
        client = Groq(api_key=GROQ_API_KEY)
        
        prompt = """Analyze this salary slip document and extract the following information.
Return ONLY a valid JSON object with these exact keys:
{
    "employer": "Company name",
    "net_salary": 12345,
    "pay_period": "Month Year",
    "gross_salary": 12345,
    "deductions": 1234
}

Rules:
- net_salary and gross_salary must be numbers (no currency symbols or commas)
- If you cannot find a value, use null
- Extract the NET/TAKE-HOME salary amount, not gross
- pay_period should be like "December 2024" or "Nov 2024"
"""
        
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.3,
            max_completion_tokens=1024
        )
        
        # Parse the response
        response_text = response.choices[0].message.content.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        extracted = json.loads(response_text)
        
        return json.dumps({
            "status": "success",
            "mode": "groq",
            "employer": extracted.get("employer"),
            "net_salary": extracted.get("net_salary"),
            "pay_period": extracted.get("pay_period"),
            "gross_salary": extracted.get("gross_salary"),
            "deductions": extracted.get("deductions")
        })
        
    except json.JSONDecodeError as e:
        return json.dumps({
            "status": "error",
            "message": f"Failed to parse response as JSON: {str(e)}",
            "raw_response": response_text[:500] if 'response_text' in dir() else None
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": f"Groq API error: {str(e)}"
        })


# Load customer data from NeonDB
def load_customer_data():
    """Load customer data from NeonDB."""
    return get_all_customers()


def calculate_interest_rate(credit_score: int) -> float:
    """
    Calculate interest rate based on credit score.
    Centralized function to avoid duplication.
    """
    if credit_score >= 800:
        return 9.5
    elif credit_score >= 750:
        return 10.5
    elif credit_score >= 700:
        return 11.0
    else:
        return 12.5


def get_offer_mart_data():
    """Generate Offer Mart data from customer data."""
    customer_data = load_customer_data()
    offer_mart = {}
    
    for customer_id, customer in customer_data.items():
        credit_score = customer.get("credit_score", 700)
        pre_approved_limit = customer.get("pre_approved_limit", 0)
        
        # Interest rate based on credit score (using centralized function)
        interest_rate = calculate_interest_rate(credit_score)
        
        # Max tenure based on credit score
        if credit_score >= 800:
            max_tenure = 60
        elif credit_score >= 750:
            max_tenure = 60
        elif credit_score >= 700:
            max_tenure = 48
        else:
            max_tenure = 36
        
        offer_mart[customer_id] = {
            "pre_approved_limit": pre_approved_limit,
            "interest_rate": interest_rate,
            "max_tenure_months": max_tenure
        }
    
    return offer_mart

OFFER_MART = get_offer_mart_data()


@tool
def fetch_preapproved_offer(customer_id: str) -> str:
    """
    Fetch pre-approved loan offer for a customer from Offer Mart.
    """
    offer = OFFER_MART.get(customer_id)

    if not offer:
        return json.dumps({
            "status": "no_offer",
            "message": "No pre-approved offer available"
        })

    return json.dumps({
        "status": "success",
        "pre_approved_limit": offer["pre_approved_limit"],
        "interest_rate": offer["interest_rate"],
        "max_tenure_months": offer["max_tenure_months"]
    })



@tool
def calculate_emi(
    loan_amount: float,
    annual_interest_rate: float,
    tenure_months: int
) -> str:
    """
    Calculate EMI based on standard reducing balance formula.
    """
    monthly_rate = annual_interest_rate / (12 * 100)

    if monthly_rate == 0:
        emi = loan_amount / tenure_months
    else:
        emi = (
            loan_amount
            * monthly_rate
            * (1 + monthly_rate) ** tenure_months
        ) / ((1 + monthly_rate) ** tenure_months - 1)

    total_payable = emi * tenure_months
    total_interest = total_payable - loan_amount

    return json.dumps({
        "loan_amount": round(loan_amount, 2),
        "interest_rate": annual_interest_rate,
        "tenure_months": tenure_months,
        "monthly_emi": round(emi, 2),
        "total_interest": round(total_interest, 2),
        "total_payable": round(total_payable, 2)
    })



CRM_BASE_URL = "http://localhost:8001"


@tool
def fetch_kyc_from_crm(customer_id: str) -> str:
    """
    Fetch customer KYC details from CRM server.
    """
    try:
        response = requests.get(f"{CRM_BASE_URL}/kyc/{customer_id}", timeout=5)
    except requests.exceptions.Timeout:
        return json.dumps({
            "status": "error",
            "message": "CRM server request timed out"
        })
    except requests.exceptions.ConnectionError:
        return json.dumps({
            "status": "error",
            "message": "Unable to connect to CRM server. Please ensure the server is running."
        })
    except requests.exceptions.RequestException as e:
        return json.dumps({
            "status": "error",
            "message": f"Network error while fetching KYC details: {str(e)}"
        })

    if response.status_code != 200:
        return json.dumps({
            "status": "error",
            "message": f"Unable to fetch KYC details (HTTP {response.status_code})"
        })

    try:
        data = response.json()
    except json.JSONDecodeError:
        return json.dumps({
            "status": "error",
            "message": "Invalid response format from CRM server"
        })

    return json.dumps({
        "status": "success",
        "customer_id": customer_id,
        "name": data["name"],
        "phone": data["phone"],
        "address": data["address"],
        "kyc_verified": data["kyc_verified"]
    })



@tool
def fetch_credit_score(customer_id: str) -> str:
    """
    Mock Credit Bureau API.
    Fetches credit score for a customer (out of 900).
    """
    customer = load_customer_data().get(customer_id)

    if not customer:
        return json.dumps({
            "status": "error",
            "message": "Customer not found in credit bureau"
        })

    return json.dumps({
        "status": "success",
        "customer_id": customer_id,
        "credit_score": customer["credit_score"],
        "score_range": "300-900"
    })



@tool
def validate_loan_eligibility(
    customer_id: str,
    loan_amount: float,
    tenure_months: int
) -> str:
    """
    Underwriting rules engine (mock).
    Applies deterministic loan eligibility rules.
    """
    customer = load_customer_data().get(customer_id)

    if not customer:
        return json.dumps({
            "status": "rejected",
            "reason": "Customer not found"
        })

    credit_score = customer["credit_score"]
    salary = customer.get("monthly_salary", customer.get("salary", 0))  # Support both field names
    pre_limit = customer["pre_approved_limit"]
    
    # Get existing loan EMIs for FOIR calculation
    existing_loans = customer.get("existing_loans", [])
    total_existing_emi = sum(loan.get("emi", 0) for loan in existing_loans)

    # Rule 1: Credit score check
    if credit_score < 700:
        return json.dumps({
            "status": "rejected",
            "reason": "Credit score below 700"
        })

    # Rule 2: Instant approval (for amounts within pre-approved limit)
    if loan_amount <= pre_limit:
        # Calculate interest rate based on credit score
        interest_rate = calculate_interest_rate(credit_score)
        
        # Calculate EMI for instant approval
        monthly_rate = interest_rate / (12 * 100)
        if monthly_rate == 0:
            emi = loan_amount / tenure_months
        else:
            emi = (
                loan_amount
                * monthly_rate
                * (1 + monthly_rate) ** tenure_months
            ) / ((1 + monthly_rate) ** tenure_months - 1)
        
        # FOIR Check: Total obligations (existing + new) should not exceed 50% of salary
        total_obligations = total_existing_emi + emi
        foir_ratio = (total_obligations / salary) * 100 if salary > 0 else 100
        
        if foir_ratio > 50:
            return json.dumps({
                "status": "rejected",
                "reason": "High debt-to-income ratio (FOIR violation)",
                "details": f"Total EMIs (existing + new) of Rs. {total_obligations:,.0f} exceeds 50% of monthly salary Rs. {salary:,.0f}",
                "foir_ratio": round(foir_ratio, 1),
                "existing_emi": round(total_existing_emi, 2),
                "new_emi": round(emi, 2)
            })
        
        return json.dumps({
            "status": "approved",
            "approval_type": "instant",
            "approved_amount": loan_amount,
            "interest_rate": interest_rate,
            "emi": round(emi, 2),
            "foir_ratio": round(foir_ratio, 1),
            "existing_emi": round(total_existing_emi, 2)
        })

    # Rule 3: Conditional approval (for amounts up to 2x pre-approved limit)
    if loan_amount <= 2 * pre_limit:
        # Calculate EMI using proper reducing balance formula with interest rate
        interest_rate = calculate_interest_rate(credit_score)
        monthly_rate = interest_rate / (12 * 100)
        
        if monthly_rate == 0:
            emi = loan_amount / tenure_months
        else:
            emi = (
                loan_amount
                * monthly_rate
                * (1 + monthly_rate) ** tenure_months
            ) / ((1 + monthly_rate) ** tenure_months - 1)

        # FOIR Check: Total obligations (existing + new) should not exceed 50% of salary
        total_obligations = total_existing_emi + emi
        foir_ratio = (total_obligations / salary) * 100 if salary > 0 else 100
        
        if foir_ratio > 50:
            return json.dumps({
                "status": "rejected",
                "reason": "High debt-to-income ratio (FOIR violation)",
                "details": f"Total EMIs (existing + new) of Rs. {total_obligations:,.0f} exceeds 50% of monthly salary Rs. {salary:,.0f}",
                "foir_ratio": round(foir_ratio, 1),
                "existing_emi": round(total_existing_emi, 2),
                "new_emi": round(emi, 2)
            })
        
        return json.dumps({
            "status": "conditional_approval",
            "requires": "salary_slip_upload",
            "approved_amount": loan_amount,
            "emi": round(emi, 2),
            "interest_rate": interest_rate,
            "foir_ratio": round(foir_ratio, 1),
            "existing_emi": round(total_existing_emi, 2)
        })

    # Rule 4: Hard rejection
    return json.dumps({
        "status": "rejected",
        "reason": "Amount exceeds 2x pre-approved limit"
    })


@tool
def generate_sanction_letter(customer_id: str, loan_amount: float, tenure: int, interest_rate: float = None) -> str:
    """
    Generate automated PDF sanction letter for approved loans.
    Includes customer name, approved amount, interest rate, tenure, EMI, and approval date.
    Creates actual PDF file in sanction_letters/ directory.
    """
    
    customer = load_customer_data().get(customer_id)
    if not customer:
        return json.dumps({
            "status": "error",
            "message": "Customer not found"
        })
    
    # Determine interest rate based on credit score if not provided
    if interest_rate is None:
        credit_score = customer.get("credit_score", 700)
        interest_rate = calculate_interest_rate(credit_score)
    
    # Calculate EMI using reducing balance formula
    monthly_rate = interest_rate / (12 * 100)
    if monthly_rate == 0:
        emi = loan_amount / tenure
    else:
        emi = (loan_amount * monthly_rate * (1 + monthly_rate) ** tenure) / ((1 + monthly_rate) ** tenure - 1)
    
    total_payable = emi * tenure
    total_interest = total_payable - loan_amount
    
    approval_date = datetime.now().strftime("%Y-%m-%d")
    letter_id = f"SL-{customer_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    pdf_filename = f"{letter_id}.pdf"
    
    # Create sanction_letters directory if it doesn't exist
    pdf_dir = "sanction_letters"
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = os.path.join(pdf_dir, pdf_filename)
    
    # Create PDF - Compact one-page design
    doc = SimpleDocTemplate(pdf_path, pagesize=A4, 
                           rightMargin=0.75*inch, leftMargin=0.75*inch,
                           topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    styles = getSampleStyleSheet()
    
    # Custom styles - compact with less spacing
    title_style = ParagraphStyle('Title', parent=styles['Heading1'],
                                  fontSize=18, alignment=TA_CENTER, spaceAfter=4,
                                  textColor=colors.HexColor('#1a1a2e'))
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'],
                                     fontSize=11, alignment=TA_CENTER, textColor=colors.grey,
                                     spaceAfter=10)
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'],
                                    fontSize=12, spaceBefore=12, spaceAfter=6,
                                    textColor=colors.HexColor('#1a1a2e'))
    body_style = ParagraphStyle('Body', parent=styles['Normal'],
                                 fontSize=10, leading=14, spaceBefore=4)
    small_style = ParagraphStyle('Small', parent=styles['Normal'],
                                  fontSize=9, leading=12, textColor=colors.grey)
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'],
                                   fontSize=8, alignment=TA_CENTER, textColor=colors.grey)
    
    story = []
    
    # Compact Header
    story.append(Paragraph("NBFC Personal Loan", title_style))
    story.append(Paragraph("SANCTION LETTER", subtitle_style))
    
    # Date and Reference in one line style
    date_str = datetime.now().strftime("%d %B, %Y")
    story.append(Paragraph(f"<b>Date:</b> {date_str} &nbsp;&nbsp;&nbsp; <b>Ref:</b> {letter_id}", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    # Customer greeting
    story.append(Paragraph("Dear " + customer.get("name", "Valued Customer") + ",", body_style))
    story.append(Spacer(1, 0.1*inch))
    
    # Short congratulations message
    story.append(Paragraph(
        "We are pleased to inform you that your Personal Loan application has been <b>APPROVED</b>. "
        "The details of your sanctioned loan are as follows:",
        body_style
    ))
    story.append(Spacer(1, 0.15*inch))
    
    # Loan Details Table - Compact
    story.append(Paragraph("Loan Details", heading_style))
    
    # Format amounts without rupee symbol - use Rs. instead
    table_data = [
        ["Particulars", "Details"],
        ["Customer Name", customer.get("name", "N/A")],
        ["Customer ID", customer_id],
        ["Sanctioned Amount", f"Rs. {loan_amount:,.0f}"],
        ["Interest Rate (p.a.)", f"{interest_rate}%"],
        ["Loan Tenure", f"{tenure} months"],
        ["Monthly EMI", f"Rs. {emi:,.0f}"],
        ["Total Interest", f"Rs. {total_interest:,.0f}"],
        ["Total Payable", f"Rs. {total_payable:,.0f}"],
    ]
    
    table = Table(table_data, colWidths=[2.2*inch, 2.8*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a2e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8f9fa')),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(table)
    story.append(Spacer(1, 0.15*inch))
    
    # Terms - Compact
    story.append(Paragraph("Terms & Conditions", heading_style))
    terms_text = (
        "1. Valid for 30 days from issue date. "
        "2. Subject to documentation and verification. "
        "3. Interest rate may be revised periodically. "
        "4. Prepayment charges may apply. "
        "5. Standard lending terms apply."
    )
    story.append(Paragraph(terms_text, small_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Signature - Compact
    story.append(Paragraph("<b>For NBFC Loans Division</b>", body_style))
    story.append(Spacer(1, 0.15*inch))
    story.append(Paragraph("_______________________", body_style))
    story.append(Paragraph("Authorized Signatory", small_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Footer
    story.append(Paragraph("This is a system-generated document | support@nbfc-loans.com | 1800-XXX-XXXX", footer_style))
    
    # Build PDF
    doc.build(story)
    
    s3_url = upload_file_to_s3(pdf_path, pdf_filename)
    final_url = s3_url if s3_url else f"/sanction-letters/{pdf_filename}"
    
    # Save to Database
    create_loan_application(
        application_id=letter_id,
        customer_id=customer_id,
        amount=loan_amount,
        tenure_months=tenure,
        interest_rate=interest_rate,
        monthly_emi=emi,
        sanction_letter_url=final_url
    )
    
    return json.dumps({
        "status": "generated",
        "letter_id": letter_id,
        "customer_name": customer["name"],
        "customer_id": customer_id,
        "sanctioned_amount": round(loan_amount, 2),
        "interest_rate": f"{interest_rate}%",
        "tenure_months": tenure,
        "monthly_emi": round(emi, 2),
        "total_interest": round(total_interest, 2),
        "total_payable": round(total_payable, 2),
        "approval_date": approval_date,
        "pdf_url": final_url,
        "message": "Sanction letter PDF generated successfully"
    })