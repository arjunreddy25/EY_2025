from agno.agent import Agent
from agno.team import Team
from agno.models.google import Gemini
from agno.tools import tool, Toolkit
from agno.db.sqlite import SqliteDb
import json

# ============= MOCK DATA & TOOLS =============

# Synthetic customer data (10 customers)
CUSTOMER_DATA = {
    "CUST001": {"name": "Rahul Sharma", "age": 32, "city": "Mumbai", "phone": "9876543210", 
                "address": "123 Marine Drive", "credit_score": 780, "pre_approved_limit": 500000,
                "current_loans": [], "salary": 80000},
    "CUST002": {"name": "Priya Patel", "age": 28, "city": "Delhi", "phone": "9876543211",
                "address": "45 Connaught Place", "credit_score": 720, "pre_approved_limit": 300000,
                "current_loans": ["Home Loan"], "salary": 60000},
    # Add more customers...
}

# ============= CUSTOM TOOLS =============

@tool
def get_customer_from_crm(customer_id: str) -> str:
    """Fetch customer KYC details from CRM system."""
    if customer_id in CUSTOMER_DATA:
        customer = CUSTOMER_DATA[customer_id]
        return json.dumps({
            "name": customer["name"],
            "phone": customer["phone"],
            "address": customer["address"],
            "kyc_verified": True
        })
    return json.dumps({"error": "Customer not found"})

@tool
def get_credit_score(customer_id: str) -> str:
    """Fetch credit score from mock credit bureau API."""
    if customer_id in CUSTOMER_DATA:
        return json.dumps({
            "credit_score": CUSTOMER_DATA[customer_id]["credit_score"],
            "score_range": "300-900"
        })
    return json.dumps({"error": "Customer not found"})

@tool
def get_pre_approved_offer(customer_id: str) -> str:
    """Fetch pre-approved loan offer from Offer Mart server."""
    if customer_id in CUSTOMER_DATA:
        customer = CUSTOMER_DATA[customer_id]
        return json.dumps({
            "pre_approved_limit": customer["pre_approved_limit"],
            "interest_rate": "10.5%",
            "max_tenure_months": 60
        })
    return json.dumps({"error": "No offers found"})

@tool
def validate_loan_eligibility(customer_id: str, loan_amount: float) -> str:
    """Validate loan eligibility based on underwriting rules."""
    if customer_id not in CUSTOMER_DATA:
        return json.dumps({"status": "rejected", "reason": "Customer not found"})
    
    customer = CUSTOMER_DATA[customer_id]
    pre_approved = customer["pre_approved_limit"]
    credit_score = customer["credit_score"]
    salary = customer["salary"]
    
    # Decision logic
    if credit_score < 700:
        return json.dumps({"status": "rejected", "reason": "Credit score below 700"})
    
    if loan_amount <= pre_approved:
        return json.dumps({"status": "instant_approval", "approved_amount": loan_amount})
    
    if loan_amount <= 2 * pre_approved:
        emi = loan_amount / 36  # Simplified EMI calculation
        if emi <= 0.5 * salary:
            return json.dumps({
                "status": "conditional_approval",
                "requires": "salary_slip_upload",
                "approved_amount": loan_amount
            })
        return json.dumps({"status": "rejected", "reason": "EMI exceeds 50% of salary"})
    
    return json.dumps({"status": "rejected", "reason": "Amount exceeds 2x pre-approved limit"})

@tool
def generate_sanction_letter(customer_id: str, loan_amount: float, tenure: int) -> str:
    """Generate PDF sanction letter for approved loans."""
    if customer_id in CUSTOMER_DATA:
        customer = CUSTOMER_DATA[customer_id]
        return json.dumps({
            "status": "generated",
            "letter_id": f"SL-{customer_id}-2024",
            "customer_name": customer["name"],
            "sanctioned_amount": loan_amount,
            "tenure_months": tenure,
            "interest_rate": "10.5%",
            "pdf_url": f"/sanction_letters/{customer_id}.pdf"
        })
    return json.dumps({"error": "Failed to generate"})

# ============= WORKER AGENTS =============

sales_agent = Agent(
    name="Sales Agent",
    role="Engage customers and negotiate loan terms",
    model=Gemini(id="gemini-2.5-flash"),
    instructions=[
        "Be warm, empathetic, and professional like a human sales executive",
        "Understand customer needs and recommend suitable loan amounts",
        "Discuss loan terms: amount, tenure (12-60 months), interest rates",
        "Handle objections gracefully and build trust",
        "Never pressure customers - guide them to the right decision"
    ],
    tools=[get_pre_approved_offer],
)

verification_agent = Agent(
    name="Verification Agent",
    role="Validate customer KYC details",
    model=Gemini(id="gemini-2.5-flash"),
    instructions=[
        "Verify customer identity from CRM records",
        "Confirm phone number and address details",
        "Flag any discrepancies for manual review"
    ],
    tools=[get_customer_from_crm],
)

underwriting_agent = Agent(
    name="Underwriting Agent",
    role="Assess loan eligibility and make approval decisions",
    model=Gemini(id="gemini-2.5-flash"),
    instructions=[
        "Fetch and evaluate credit scores (minimum 700 required)",
        "Apply underwriting rules strictly",
        "Request salary slip if loan > pre-approved limit but ≤ 2x",
        "Reject if amount > 2x pre-approved or credit score < 700"
    ],
    tools=[get_credit_score, validate_loan_eligibility],
)

sanction_agent = Agent(
    name="Sanction Agent",
    role="Generate sanction letters for approved loans",
    model=Gemini(id="gemini-2.5-flash"),
    instructions=[
        "Generate PDF sanction letter only for approved loans",
        "Include all loan terms and conditions",
        "Provide download link to customer"
    ],
    tools=[generate_sanction_letter],
)

# ============= MASTER AGENT (TEAM) =============

loan_sales_team = Team(
    name="Loan Sales Team",
    model=Gemini(id="gemini-2.5-flash"),
    members=[sales_agent, verification_agent, underwriting_agent, sanction_agent],
    instructions=[
        "You are a Master Agent orchestrating a personal loan sales process",
        "Manage conversation flow naturally - customer shouldn't feel they're talking to multiple agents",
        "Workflow: Sales → Verification → Underwriting → Sanction",
        "Delegate to appropriate worker agents based on conversation stage",
        "Handle interruptions and topic changes gracefully",
        "Always maintain context across the entire conversation"
    ],
    db=SqliteDb(db_file="loan_sessions.db", session_table="loan_conversations"),
    add_history_to_context=True,
    show_members_responses=False,  # Seamless experience
    markdown=True,
)

# ============= RUN THE SYSTEM =============
if __name__ == "__main__":
    # Simulate customer conversation
    loan_sales_team.print_response(
        "Hi, I'm interested in a personal loan. My customer ID is CUST002, can do the process for me?",
        stream=True
    )




