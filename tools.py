# tools.py
from agno.tools import tool
import json
import os
import requests
# Load customer data to generate offers
def load_customer_data():
    """Load customer data from data.json file."""
    data_file = os.path.join(os.path.dirname(__file__), "data.json")
    try:
        with open(data_file, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def get_offer_mart_data():
    """Generate Offer Mart data from customer data."""
    customer_data = load_customer_data()
    offer_mart = {}
    
    for customer_id, customer in customer_data.items():
        credit_score = customer.get("credit_score", 700)
        pre_approved_limit = customer.get("pre_approved_limit", 0)
        
        # Interest rate based on credit score
        if credit_score >= 800:
            interest_rate = 9.5
            max_tenure = 60
        elif credit_score >= 750:
            interest_rate = 10.5
            max_tenure = 60
        elif credit_score >= 700:
            interest_rate = 11.0
            max_tenure = 48
        else:
            interest_rate = 12.5
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
    salary = customer["salary"]
    pre_limit = customer["pre_approved_limit"]

    # Rule 1: Credit score check
    if credit_score < 700:
        return json.dumps({
            "status": "rejected",
            "reason": "Credit score below 700"
        })

    # Rule 2: Instant approval
    if loan_amount <= pre_limit:
        return json.dumps({
            "status": "approved",
            "approval_type": "instant",
            "approved_amount": loan_amount
        })

    # Rule 3: Conditional approval
    if loan_amount <= 2 * pre_limit:
        # Calculate EMI using proper reducing balance formula with interest rate
        # Get interest rate based on credit score
        if credit_score >= 800:
            interest_rate = 9.5
        elif credit_score >= 750:
            interest_rate = 10.5
        elif credit_score >= 700:
            interest_rate = 11.0
        else:
            interest_rate = 12.5
        
        # Calculate EMI using reducing balance formula
        monthly_rate = interest_rate / (12 * 100)
        
        if monthly_rate == 0:
            emi = loan_amount / tenure_months
        else:
            emi = (
                loan_amount
                * monthly_rate
                * (1 + monthly_rate) ** tenure_months
            ) / ((1 + monthly_rate) ** tenure_months - 1)

        if emi <= 0.5 * salary:
            return json.dumps({
                "status": "conditional_approval",
                "requires": "salary_slip_upload",
                "approved_amount": loan_amount,
                "emi": round(emi, 2),
                "interest_rate": interest_rate
            })

        return json.dumps({
            "status": "rejected",
            "reason": "EMI exceeds 50% of salary"
        })

    # Rule 4: Hard rejection
    return json.dumps({
        "status": "rejected",
        "reason": "Amount exceeds 2x pre-approved limit"
    })
