import os
import json
from dotenv import load_dotenv

from agno.agent import Agent
from agno.team import Team
from agno.models.groq import Groq
from agno.tools import tool
from agno.db.sqlite import SqliteDb

from tools import fetch_preapproved_offer, calculate_emi, fetch_kyc_from_crm, fetch_credit_score, validate_loan_eligibility
from prompts import SALES_AGENT_PROMPT, VERIFICATION_AGENT_PROMPT


load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set in environment or .env file")




groq_model = Groq(
    id="qwen-qwq-32b",  # Qwen 32B model on Groq
    api_key=GROQ_API_KEY,
)
# Alternative model IDs to try if qwen-qwq-32b doesn't work:
# - "qwen2.5-32b-instruct"
# - "llama-3.3-70b-versatile"
# - "llama-3.1-70b-versatile"




def load_customer_data():
    data_path = os.path.join(os.path.dirname(__file__), "data.json")
    with open(data_path, "r") as f:
        return json.load(f)


CUSTOMER_DATA = load_customer_data()






@tool
def generate_sanction_letter(customer_id: str, loan_amount: float, tenure: int) -> str:
    """Generate sanction letter metadata."""
    customer = CUSTOMER_DATA.get(customer_id)
    if not customer:
        return json.dumps({
            "status": "error",
            "message": "Customer not found"
        })

    return json.dumps({
        "status": "generated",
        "letter_id": f"SL-{customer_id}-2024",
        "customer_name": customer["name"],
        "sanctioned_amount": loan_amount,
        "tenure_months": tenure,
        "interest_rate": "10.5%",
        "pdf_url": f"/sanction_letters/{customer_id}.pdf"
    })



sales_agent = Agent(
    name="Sales Agent",
    role="Personal Loan Sales Executive",
    model=groq_model,
    instructions=[SALES_AGENT_PROMPT],
    tools=[fetch_preapproved_offer, calculate_emi],
)

verification_agent = Agent(
    name="Verification Agent",
    role="KYC Verification Executive",
    model=groq_model,
    instructions=[ VERIFICATION_AGENT_PROMPT ],
    tools=[fetch_kyc_from_crm],
)

underwriting_agent = Agent(
    name="Underwriting Agent",
    role="Loan Underwriting Officer",
    model=groq_model,
    instructions=[
        "Evaluate credit score and eligibility",
        "Apply underwriting rules strictly",
        "Do not override decision logic"
    ],
    tools=[fetch_credit_score, validate_loan_eligibility],
)

sanction_agent = Agent(
    name="Sanction Agent",
    role="Sanction Letter Generator",
    model=groq_model,
    instructions=[
        "Generate sanction letters only for approved loans",
        "Return sanction letter details"
    ],
    tools=[generate_sanction_letter],
)




db = SqliteDb(
    db_file="loan_sessions.db",
    session_table="loan_conversations"
)

loan_sales_team = Team(
    name="Loan Sales Team",
    model=groq_model,
    members=[
        sales_agent,
        verification_agent,
        underwriting_agent,
        sanction_agent
    ],
    instructions=[
        "You are the master orchestrator for personal loan sales",
        "Follow workflow: Sales → Verification → Underwriting → Sanction",
        "Maintain context and continuity",
        "Never expose internal agent transitions"
    ],
    db=db,
    add_history_to_context=True,
    show_members_responses=False,
    markdown=True,
)




if __name__ == "__main__":
    print("Loan Sales Assistant")
    print("Type 'exit' to quit\n")

    session_id = "loan_conversation_session"

    while True:
        user_input = input("User: ").strip()
        if user_input.lower() in {"exit", "quit", "bye"}:
            print("Session ended. Conversation saved.")
            break

        loan_sales_team.print_response(
            user_input,
            stream=True,
            session_id=session_id
        )
