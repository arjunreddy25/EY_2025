import os
import json
from dotenv import load_dotenv

from agno.agent import Agent
from agno.team import Team
from agno.models.groq import Groq
from agno.db.sqlite import SqliteDb

from tools import fetch_preapproved_offer, calculate_emi, fetch_kyc_from_crm, fetch_credit_score, validate_loan_eligibility, generate_sanction_letter
from prompts import SALES_AGENT_PROMPT, VERIFICATION_AGENT_PROMPT, UNDERWRITING_AGENT_PROMPT


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




def load_customer_data():
    data_path = os.path.join(os.path.dirname(__file__), "data.json")
    with open(data_path, "r") as f:
        return json.load(f)


CUSTOMER_DATA = load_customer_data()


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
    instructions=[UNDERWRITING_AGENT_PROMPT],
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
        "You are the Master Agent (Agentic AI Controller) for personal loan sales at a regulated NBFC.",
        "You own the entire conversation and maintain a human-like, persuasive, and polite tone.",
        "",
        "DECISION LOGIC - When to trigger each agent:",
        "1. Start: Engage customer and pitch personal loan when they inquire",
        "   - Early in conversation, ask for customer ID (format: CUST001, CUST002, etc.)",
        "   - Store customer_id in context for all subsequent agent calls",
        "2. Sales Agent: Delegate when customer shows interest in exploring loan options",
        "   - Let Sales Agent negotiate loan amount, tenure, and EMI",
        "   - Wait for Sales Agent to finalize loan request",
        "3. Verification Agent: Trigger ONLY after customer agrees to proceed with loan application",
        "   - First, obtain customer_id from customer (ask: 'May I have your customer ID?' or extract from context)",
        "   - Customer IDs are in format: CUST001, CUST002, CUST003, etc.",
        "   - Delegate KYC verification task with customer_id: 'Verify KYC for customer_id: CUST001'",
        "   - Wait for verification status (verified/failed)",
        "4. Underwriting Agent: Trigger ONLY after KYC is verified successfully",
        "   - Delegate loan eligibility evaluation with customer_id and loan details",
        "   - Provide: customer_id, loan_amount, tenure_months",
        "   - Receive decision: approved/conditional_approval/rejected",
        "5. Salary Slip Request: If underwriting returns 'conditional_approval', request salary slip upload",
        "   - Explain why it's needed (loan amount exceeds pre-approved limit)",
        "   - Wait for customer to provide salary slip",
        "6. Sanction Agent: Trigger ONLY after loan is approved (instant or conditional)",
        "   - Extract interest_rate from underwriting response (it's included in approval)",
        "   - Generate sanction letter with customer_id, loan_amount, tenure, and interest_rate",
        "7. Handle Rejections: If loan is rejected, explain clearly and professionally",
        "   - Explain the reason (credit score, EMI too high, amount too high)",
        "   - Offer alternatives if appropriate",
        "",
        "CRITICAL RULES:",
        "- Never expose internal agent names or system architecture to customer",
        "- Never mention CRM systems, backend systems, or system operational status",
        "- Do NOT mention system maintenance, restoration, or downtime",
        "- Always maintain conversational continuity - customer talks only to you",
        "- Handle all approvals, rejections, and explanations yourself",
        "- Follow the workflow strictly: Sales → Verification → Underwriting → Sanction",
        "- If any step fails, pause and inform customer clearly without mentioning system issues",
        "- End conversation professionally after sanction letter or rejection"
    ],
    db=db,
    add_history_to_context=True,
    show_members_responses=False,
    markdown=True,
    respond_directly=True,
    share_member_interactions=True
)




if __name__ == "__main__":
    from agno.agent import RunEvent
    from agno.team.team import TeamRunEvent
    
    print("Loan Sales Assistant")
    print("Type 'exit' to quit\n")

    session_id = "loan_conversation_session"

    while True:
        user_input = input("User: ").strip()
        if user_input.lower() in {"exit", "quit", "bye"}:
            print("Session ended. Conversation saved.")
            break

        print("\nAssistant: ", end="", flush=True)
        
        content_started = False
        stream = loan_sales_team.run(
            user_input,
            stream=True,
            stream_events=True,
            session_id=session_id
        )
        
        for run_output_event in stream:
            # Handle team-level events
            if run_output_event.event in [TeamRunEvent.run_started]:
                pass  # Team started
            
            if run_output_event.event in [TeamRunEvent.run_completed]:
                pass  # Team completed
            
            # Handle team tool calls
            if run_output_event.event in [TeamRunEvent.tool_call_started]:
                print(f"\n🔧 [Tool: {run_output_event.tool.tool_name}]", end="", flush=True)
            
            if run_output_event.event in [TeamRunEvent.tool_call_completed]:
                print(" ✓", end="", flush=True)
            
            # Handle member-level tool events
            if run_output_event.event in [RunEvent.tool_call_started]:
                if hasattr(run_output_event, 'agent_id'):
                    print(f"\n🤖 [{run_output_event.agent_id}]", end="", flush=True)
            
            if run_output_event.event in [RunEvent.tool_call_completed]:
                if hasattr(run_output_event, 'tool') and hasattr(run_output_event.tool, 'tool_name'):
                    print(f" [{run_output_event.tool.tool_name}] ✓", end="", flush=True)
            
            # Handle content streaming - this is where tokens stream
            if run_output_event.event in [TeamRunEvent.run_content]:
                if not content_started:
                    content_started = True
                if hasattr(run_output_event, 'content') and run_output_event.content:
                    print(run_output_event.content, end="", flush=True)
        
        print("\n")
