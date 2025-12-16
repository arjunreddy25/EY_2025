import os
import json
from dotenv import load_dotenv

from agno.agent import Agent
from agno.team import Team
from agno.models.groq import Groq
from agno.db.sqlite import SqliteDb

from tools import fetch_preapproved_offer, calculate_emi, fetch_kyc_from_crm, fetch_credit_score, validate_loan_eligibility, generate_sanction_letter
from prompts import SALES_AGENT_PROMPT, VERIFICATION_AGENT_PROMPT, UNDERWRITING_AGENT_PROMPT, SANCTION_AGENT_PROMPT
from db_neon import get_all_customers


load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set in environment or .env file")




groq_model = Groq(
    id="qwen/qwen3-32b",  # Qwen 32B model on Groq
    api_key=GROQ_API_KEY,
    temperature=0.7,  # Balanced creativity and speed
)
# Alternative model IDs to try if qwen-qwq-32b doesn't work:
# - "qwen2.5-32b-instruct"
# - "llama-3.3-70b-versatile"
# - "llama-3.1-70b-versatile"



db = SqliteDb(
    db_file="loan_sessions.db",
    session_table="loan_conversations"
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
        "You are the Master Agent - a digital sales assistant for personal loans at an NBFC.",
        "You OWN the conversation. Customer talks only to you, never directly to worker agents.",
        "Be human-like, persuasive, and polite throughout.",
        "",
        "CUSTOMER IDENTIFICATION:",
        "- If the message starts with [SYSTEM CONTEXT: Customer identified...], the customer is already identified.",
        "- Extract the customer_id from the system context and use it for all tool calls.",
        "- DO NOT ask for customer ID again - you already have it!",
        "- Greet them by name if provided in the context.",
        "- If NO system context is provided, then ask for customer ID.",
        "",
        "TEAM MEMBERS & ROLES:",
        "1. Sales Agent: Negotiates loan amount, tenure, and calculates EMI.",
        "2. Verification Agent: Verifies customer identity (KYC) from CRM.",
        "3. Underwriting Agent: Checks credit score, pre-approved limits, and loan eligibility.",
        "4. Sanction Agent: Generates the final sanction letter PDF.",
        "",
        "CONVERSATION FLOW:",
        "1. ENGAGE: Greet customer by name (if known), understand their loan needs",
        "2. SALES: Delegate to Sales Agent to discuss loan amount, tenure, and calculate EMI",
        "   - Sales Agent does NOT know pre-approved limit (that comes later in underwriting)",
        "   - Sales Agent takes customer's desired amount and calculates EMI",
        "   - Wait for customer to confirm final loan terms",
        "3. VERIFICATION: After sales complete, delegate to Verification Agent for KYC check",
        "   - If failed, inform customer and stop",
        "4. UNDERWRITING: After KYC verified, delegate to Underwriting Agent with loan details",
        "   - Underwriting Agent fetches credit score and pre-approved limit",
        "   - Underwriting Agent checks if loan amount is within eligibility rules",
        "   - Read the decision carefully:",
        "   - APPROVED: Proceed to sanction",
        "   - CONDITIONAL (needs salary slip): Ask customer to upload salary slip, then proceed",
        "   - REJECTED: Explain reason clearly and end conversation",
        "5. SANCTION: Only after approval (instant or conditional with salary slip), delegate to Sanction Agent",
        "6. CLOSE: Present sanction letter, explain next steps, thank customer",
        "",
        "RULES:",
        "- Don't skip steps or re-delegate unnecessarily",
        "- Don't expose agent names or technical systems to customer",
        "- Explain all decisions in plain English",
        "- When customer is pre-identified, skip asking for ID and go straight to understanding their loan needs",
        "- Always pass the customer_id to tools when calling them"
    ],
    db=db,
    add_history_to_context=True,
    show_members_responses=True,
    markdown=True,
    share_member_interactions=True
)




if __name__ == "__main__":
    import asyncio
    from datetime import datetime
    from agno.agent import RunEvent
    from agno.team.team import TeamRunEvent
    
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
