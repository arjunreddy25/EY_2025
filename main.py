import os
import json
from dotenv import load_dotenv

import asyncio
from datetime import datetime
from agno.agent import Agent, RunEvent
from agno.team import Team
from agno.team.team import TeamRunEvent
from agno.models.groq import Groq
from agno.db.postgres import PostgresDb

from tools import fetch_preapproved_offer, calculate_emi, fetch_kyc_from_crm, fetch_credit_score, validate_loan_eligibility, generate_sanction_letter
from prompts import SALES_AGENT_PROMPT, VERIFICATION_AGENT_PROMPT, UNDERWRITING_AGENT_PROMPT, SANCTION_AGENT_PROMPT
from db_neon import get_all_customers


load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set in environment or .env file")

NEON_DB_URL = os.getenv("NEON_DB")
if not NEON_DB_URL:
    raise RuntimeError("NEON_DB is not set in environment or .env file")



groq_model = Groq(
    id="qwen/qwen3-32b",  # Qwen 32B model on Groq
    api_key=GROQ_API_KEY,
    temperature=0.7,  # Balanced creativity and speed
)
# Alternative model IDs to try if qwen-qwq-32b doesn't work:
# - "qwen2.5-32b-instruct"
# - "llama-3.3-70b-versatile"
# - "llama-3.1-70b-versatile"


# Use PostgresDb with NeonDB for agent memory
db = PostgresDb(
    db_url=NEON_DB_URL,
    session_table="agent_sessions"
)

def load_customer_data():
    """Load customer data from NeonDB."""
    return get_all_customers()


CUSTOMER_DATA = load_customer_data()


sales_agent = Agent(
    name="Sales Agent",
    role="Personal Loan Sales Executive",
    model=groq_model,
    instructions=[SALES_AGENT_PROMPT],
    tools=[calculate_emi],
    db=db
)

verification_agent = Agent(
    name="Verification Agent",
    role="KYC Verification Executive",
    model=groq_model,
    instructions=[VERIFICATION_AGENT_PROMPT],
    tools=[fetch_kyc_from_crm],
    db=db
)

underwriting_agent = Agent(
    name="Underwriting Agent",
    role="Loan Underwriting Officer",
    model=groq_model,
    instructions=[UNDERWRITING_AGENT_PROMPT],
    tools=[fetch_credit_score, fetch_preapproved_offer, validate_loan_eligibility],
    db=db
)

sanction_agent = Agent(
    name="Sanction Agent",
    role="Sanction Letter Generator",
    model=groq_model,
    instructions=[SANCTION_AGENT_PROMPT],
    tools=[generate_sanction_letter],
    db=db
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
        "You are a digital loan assistant for an NBFC. You help customers get personal loans.",
        "Customer talks only to you. Delegate to team members one step at a time.",
        "",
        "If message has [SYSTEM CONTEXT: Customer identified...], use that customer_id and greet by name.",
        "",
        "STEP-BY-STEP FLOW (must complete each step before next):",
        "",
        "STEP 1 - SALES:",
        "- First, delegate to Sales Agent to discuss loan amount and calculate EMI",
        "- Wait for customer to confirm the final loan terms",
        "- Only proceed to Step 2 after customer confirms",
        "",
        "STEP 2 - VERIFICATION:",
        "- Delegate to Verification Agent to check KYC",
        "- Only proceed if KYC is verified",
        "",
        "STEP 3 - UNDERWRITING:",
        "- Delegate to Underwriting Agent with loan amount and tenure",
        "- If approved: proceed to Step 4",
        "- If conditional (needs salary slip): ask customer to upload, then re-delegate",
        "- If rejected: explain and end",
        "",
        "STEP 4 - SANCTION:",
        "- Only after approval, delegate to Sanction Agent",
        "- Present the sanction letter to customer",
        "",
        "IMPORTANT: Do ONE step at a time. Wait for each step to complete before starting the next.",
    ],
    db=db,
    add_history_to_context=True,
    show_members_responses=True,
    markdown=True,
    share_member_interactions=True
)




if __name__ == "__main__":
    
    async def process_message(user_input: str, session_id: str):
        """Process a single message asynchronously with concurrent member execution."""
        content_started = False
        
        async for run_output_event in loan_sales_team.arun(
            user_input,
            stream=True,
            stream_events=True,
            session_id=session_id
        ):
            if run_output_event.event in [TeamRunEvent.run_started]:
                pass
            
            if run_output_event.event in [TeamRunEvent.run_completed]:
                pass
            
            if run_output_event.event in [TeamRunEvent.tool_call_started]:
                print(f"\n🔧 [Tool: {run_output_event.tool.tool_name}]", end="", flush=True)
            
            if run_output_event.event in [TeamRunEvent.tool_call_completed]:
                print(" ✓", end="", flush=True)
            
            if run_output_event.event in [RunEvent.tool_call_started]:
                if hasattr(run_output_event, 'agent_id'):
                    print(f"\n🤖 [{run_output_event.agent_id}]", end="", flush=True)
            
            if run_output_event.event in [RunEvent.tool_call_completed]:
                if hasattr(run_output_event, 'tool') and hasattr(run_output_event.tool, 'tool_name'):
                    print(f" [{run_output_event.tool.tool_name}] ✓", end="", flush=True)
            
            if run_output_event.event in [TeamRunEvent.run_content]:
                if not content_started:
                    content_started = True
                if hasattr(run_output_event, 'content') and run_output_event.content:
                    print(run_output_event.content, end="", flush=True)
    
    print("=" * 60)
    print("🏦 Loan Sales Assistant (Agentic AI)")
    print("=" * 60)
    print("Type 'exit' to quit | Type 'new' to start fresh conversation\n")

    session_id = f"loan_session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    print(f"📝 Session ID: {session_id}\n")

    while True:
        user_input = input("User: ").strip()
        
        if user_input.lower() in {"exit", "quit", "bye"}:
            print("\n✅ Session ended. Conversation saved to database.")
            break
        
        if user_input.lower() == "new":
            session_id = f"loan_session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            print(f"\n🔄 New session started: {session_id}\n")
            continue

        print("\nAssistant: ", end="", flush=True)
        asyncio.run(process_message(user_input, session_id))
        print("\n")
