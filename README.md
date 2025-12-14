# Loan Sales Assistant - Multi-Agent System

A multi-agent AI system for personal loan sales processing using agno framework with Groq's Qwen 32B model. The system orchestrates multiple specialized agents (Sales, Verification, Underwriting, Sanction) to handle the complete loan application workflow.

## Features

- 🤖 **Multi-Agent Architecture**: Specialized agents for Sales, Verification, Underwriting, and Sanction
- 💾 **Persistent Memory**: Conversation history stored in SQLite database
- 🔌 **CRM Integration**: RESTful API server for customer KYC verification
- 📊 **15 Customer Profiles**: Diverse test data with varying credit scores and loan limits
- 🛠️ **Tool Integration**: EMI calculator, pre-approved offers, credit score checks

## Project Structure

```
EY_2025/
├── main.py              # Main application with agents and team orchestration
├── tools.py             # Tool definitions (EMI calculator, CRM calls, etc.)
├── prompts.py          # Agent instructions and prompts
├── crm_server.py       # FastAPI server for CRM KYC endpoints
├── data.json           # Customer data (15 profiles)
├── loan_sessions.db    # SQLite database for conversation history
├── requirements.txt    # Python dependencies
└── README.md          # This file
```

## Prerequisites

- Python 3.12 or higher
- Groq API key (get it from [console.groq.com](https://console.groq.com))

## Setup Instructions

### Option 1: Using Python venv (Recommended)

1. **Create virtual environment:**
   ```bash
   python3 -m venv venv
   ```

2. **Activate virtual environment:**
   - **macOS/Linux:**
     ```bash
     source venv/bin/activate
     ```
   - **Windows:**
     ```bash
     venv\Scripts\activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create `.env` file:**
   ```bash
   echo "GROQ_API_KEY=your_groq_api_key_here" > .env
   ```
   Replace `your_groq_api_key_here` with your actual Groq API key.

5. **Run the application:**
   ```bash
   python main.py
   ```

### Option 2: Using Conda

1. **Create conda environment:**
   ```bash
   conda create -n ey2025 python=3.12
   conda activate ey2025
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Create `.env` file:**
   ```bash
   echo "GROQ_API_KEY=your_groq_api_key_here" > .env
   ```

4. **Run the application:**
   ```bash
   python main.py
   ```

## Running the CRM Server

The CRM server provides KYC verification endpoints. Run it in a separate terminal:

```bash
# Using uvicorn (recommended)
uvicorn crm_server:app --port 8001 --reload

# Or using Python
python -m uvicorn crm_server:app --port 8001
```

The server will be available at `http://localhost:8001`

## Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=gsk_your_api_key_here
```

## Usage

1. **Start the CRM server** (in one terminal):
   ```bash
   uvicorn crm_server:app --port 8001
   ```

2. **Run the main application** (in another terminal):
   ```bash
   python main.py
   ```

3. **Interact with the loan assistant:**
   ```
   User: Hi, I'm interested in a personal loan. My customer ID is CUST001
   ```

4. **Exit the conversation:**
   ```
   User: exit
   ```

## Agent Workflow

1. **Sales Agent**: Engages customer, discusses loan terms, calculates EMI
2. **Verification Agent**: Validates customer KYC details from CRM
3. **Underwriting Agent**: Checks credit score and loan eligibility
4. **Sanction Agent**: Generates sanction letters for approved loans

## Customer Data

The system includes 15 diverse customer profiles in `data.json`:
- Credit scores: 620-850
- Pre-approved limits: ₹100,000 - ₹1,000,000
- Various loan types and employment statuses

## API Endpoints

### CRM Server (`crm_server.py`)

- `GET /kyc/{customer_id}` - Fetch customer KYC details

Example:
```bash
curl http://localhost:8001/kyc/CUST001
```

## Troubleshooting

### Issue: Team tool calling errors with Groq

**Problem**: `400 INVALID_ARGUMENT` error when using Team with Groq.

**Solution**: This is a known compatibility issue. The Team feature uses internal delegation tools that Groq's API doesn't support. Consider using a single agent with all tools instead.

### Issue: CRM server connection failed

**Problem**: `Unable to fetch KYC details` error.

**Solution**: Make sure the CRM server is running on port 8001:
```bash
uvicorn crm_server:app --port 8001
```

### Issue: Module not found errors

**Problem**: `ModuleNotFoundError` when running the application.

**Solution**: Ensure you've activated your virtual environment and installed dependencies:
```bash
source venv/bin/activate  # or conda activate ey2025
pip install -r requirements.txt
```

## Dependencies

- **agno**: Multi-agent framework
- **groq**: Groq API client
- **fastapi**: Web framework for CRM server
- **uvicorn**: ASGI server
- **requests**: HTTP client for API calls
- **python-dotenv**: Environment variable management
- **sqlalchemy**: Database ORM (used by agno)

## License

This project is for educational/demonstration purposes.

## Notes

- The system uses Groq's Qwen 32B model (`qwen-qwq-32b`)
- Conversation history is persisted in `loan_sessions.db`
- Customer data is stored in `data.json` (not a real database)
- The CRM server is a mock implementation for demonstration

