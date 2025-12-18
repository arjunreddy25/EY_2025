"""
NeonDB Database Module
Provides connection and CRUD operations for customer data.
"""

import os
import json
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("NEON_DB")

if not DATABASE_URL:
    raise RuntimeError("NEON_DB is not set in environment or .env file")


def get_connection():
    """Get a database connection."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def test_connection() -> bool:
    """Test database connection."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                result = cur.fetchone()
                print("✅ Database connection successful!")
                return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False


# ============================================
# Customer Operations
# ============================================

def get_customer(customer_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single customer by ID."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM customers WHERE customer_id = %s",
                (customer_id,)
            )
            customer = cur.fetchone()
            
            if customer:
                # Convert to dict and fetch existing loans
                customer = dict(customer)
                customer['existing_loans'] = get_existing_loans(customer_id)
                
                # Convert Decimal to float for JSON compatibility
                for key in ['monthly_salary', 'total_monthly_income', 'pre_approved_limit', 'total_existing_emi']:
                    if customer.get(key):
                        customer[key] = float(customer[key])
                
            return customer


def get_all_customers() -> Dict[str, Dict[str, Any]]:
    """
    Fetch all customers as a dictionary keyed by customer_id.
    Maintains compatibility with existing load_customer_data() format.
    Uses batch query for loans to avoid N+1 problem.
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            # Fetch all customers in one query
            cur.execute("SELECT * FROM customers")
            customers = cur.fetchall()
            
            # Fetch ALL loans in one query (batch, not N+1)
            cur.execute("""
                SELECT customer_id, loan_type as type, emi, remaining_months 
                FROM existing_loans
            """)
            all_loans = cur.fetchall()
            
            # Group loans by customer_id in memory (fast)
            loans_by_customer = {}
            for loan in all_loans:
                loan = dict(loan)
                cid = loan.pop('customer_id')
                if cid not in loans_by_customer:
                    loans_by_customer[cid] = []
                loans_by_customer[cid].append(loan)
            
            result = {}
            for customer in customers:
                customer = dict(customer)
                customer_id = customer['customer_id']
                
                # Get loans from memory (no extra DB query!)
                customer['existing_loans'] = loans_by_customer.get(customer_id, [])
                
                # Convert Decimal to float for JSON compatibility
                for key in ['monthly_salary', 'total_monthly_income', 'pre_approved_limit', 'total_existing_emi']:
                    if customer.get(key):
                        customer[key] = float(customer[key])
                
                # Use customer_id as key (like data.json format)
                result[customer_id] = customer
                
            return result


def get_customer_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Fetch a customer by email address."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM customers WHERE email = %s",
                (email,)
            )
            customer = cur.fetchone()
            
            if customer:
                customer = dict(customer)
                customer['existing_loans'] = get_existing_loans(customer['customer_id'])
                
            return customer


def delete_customer(customer_id: str) -> bool:
    """
    Delete a customer and all related data (loans, links).
    Returns True if deletion was successful.
    """
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # 1. Delete related links
                cur.execute("DELETE FROM customer_links WHERE customer_id = %s", (customer_id,))
                
                # 2. Delete related loans
                cur.execute("DELETE FROM existing_loans WHERE customer_id = %s", (customer_id,))
                
                # 3. Delete customer record
                cur.execute("DELETE FROM customers WHERE customer_id = %s", (customer_id,))
                
                return True
    except Exception as e:
        print(f"❌ Error deleting customer {customer_id}: {e}")
        return False



def get_existing_loans(customer_id: str) -> list:
    """Fetch existing loans for a customer."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT loan_type as type, emi, remaining_months 
                FROM existing_loans 
                WHERE customer_id = %s
                """,
                (customer_id,)
            )
            loans = cur.fetchall()
            return [dict(loan) for loan in loans]



# ============================================
# Loan Application Operations
# ============================================

def create_loan_application_table_if_not_exists():
    """Create loan_applications table if it doesn't exist."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS loan_applications (
                    application_id VARCHAR(50) PRIMARY KEY,
                    customer_id VARCHAR(50) NOT NULL REFERENCES customers(customer_id),
                    amount DECIMAL(15,2) NOT NULL,
                    tenure_months INT NOT NULL,
                    interest_rate DECIMAL(5,2) NOT NULL,
                    monthly_emi DECIMAL(15,2) NOT NULL,
                    status VARCHAR(20) DEFAULT 'SANCTIONED',
                    sanction_letter_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
# Run table creation on module load (safe for dev)
try:
    create_loan_application_table_if_not_exists()
except Exception as e:
    print(f"⚠️ Warning: Could not check/create loan_applications table: {e}")


def create_loan_application(
    application_id: str,
    customer_id: str,
    amount: float,
    tenure_months: int,
    interest_rate: float,
    monthly_emi: float,
    sanction_letter_url: str
) -> bool:
    """Save a new loan application/sanction."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO loan_applications 
                    (application_id, customer_id, amount, tenure_months, interest_rate, monthly_emi, sanction_letter_url)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (application_id, customer_id, amount, tenure_months, interest_rate, monthly_emi, sanction_letter_url)
                )
                return True
    except Exception as e:
        print(f"❌ Error creating loan application: {e}")
        return False


def get_loan_applications(customer_id: str) -> list:
    """Fetch all loan applications for a customer."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT application_id, customer_id, amount, tenure_months, 
                           interest_rate, monthly_emi, status, sanction_letter_url, created_at
                    FROM loan_applications 
                    WHERE customer_id = %s
                    ORDER BY created_at DESC
                    """,
                    (customer_id,)
                )
                loans = cur.fetchall()
                result = []
                for loan in loans:
                    loan_dict = dict(loan)
                    # Convert Decimal to float for JSON compatibility
                    for key in ['amount', 'interest_rate', 'monthly_emi']:
                        if loan_dict.get(key):
                            loan_dict[key] = float(loan_dict[key])
                    result.append(loan_dict)
                return result
    except Exception as e:
        print(f"❌ Error fetching loan applications: {e}")
        return []


def get_latest_loan_status(customer_id: str) -> Optional[Dict[str, Any]]:
    """Get the most recent loan application status for a customer."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT application_id, status, sanction_letter_url, amount, created_at
                    FROM loan_applications 
                    WHERE customer_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (customer_id,)
                )
                loan = cur.fetchone()
                if loan:
                    loan_dict = dict(loan)
                    if loan_dict.get('amount'):
                        loan_dict['amount'] = float(loan_dict['amount'])
                    return loan_dict
                return None
    except Exception as e:
        print(f"❌ Error fetching latest loan status: {e}")
        return None


# ============================================
# Salary Slip Verification Operations
# ============================================

def add_salary_slip_columns_if_not_exist():
    """Add salary slip tracking columns to customers table if they don't exist."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Check if columns exist and add them if not
                cur.execute("""
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'customers' AND column_name = 'salary_slip_verified'
                        ) THEN
                            ALTER TABLE customers ADD COLUMN salary_slip_verified BOOLEAN DEFAULT FALSE;
                        END IF;
                        
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'customers' AND column_name = 'salary_slip_url'
                        ) THEN
                            ALTER TABLE customers ADD COLUMN salary_slip_url TEXT;
                        END IF;
                        
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'customers' AND column_name = 'salary_slip_verified_at'
                        ) THEN
                            ALTER TABLE customers ADD COLUMN salary_slip_verified_at TIMESTAMP;
                        END IF;
                    END $$;
                """)
        print("✅ Salary slip columns verified/added to customers table")
    except Exception as e:
        print(f"⚠️ Warning: Could not add salary slip columns: {e}")

# Run migration on module load
try:
    add_salary_slip_columns_if_not_exist()
except Exception as e:
    print(f"⚠️ Warning: Could not run salary slip migration: {e}")


def update_customer_salary_verification(
    customer_id: str, 
    verified: bool, 
    salary_slip_url: Optional[str] = None
) -> bool:
    """Update customer's salary slip verification status."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE customers 
                    SET salary_slip_verified = %s, 
                        salary_slip_url = %s,
                        salary_slip_verified_at = CASE WHEN %s THEN NOW() ELSE salary_slip_verified_at END
                    WHERE customer_id = %s
                    """,
                    (verified, salary_slip_url, verified, customer_id)
                )
                return cur.rowcount > 0
    except Exception as e:
        print(f"❌ Error updating salary verification: {e}")
        return False


def get_customer_documents(customer_id: str) -> Dict[str, Any]:
    """Get all documents for a customer: salary slips and sanction letters."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Get salary slip info
                cur.execute(
                    """
                    SELECT salary_slip_verified, salary_slip_url, salary_slip_verified_at
                    FROM customers 
                    WHERE customer_id = %s
                    """,
                    (customer_id,)
                )
                customer_docs = cur.fetchone()
                
                # Get all sanction letters
                cur.execute(
                    """
                    SELECT application_id, sanction_letter_url, amount, status, created_at
                    FROM loan_applications 
                    WHERE customer_id = %s AND sanction_letter_url IS NOT NULL
                    ORDER BY created_at DESC
                    """,
                    (customer_id,)
                )
                sanction_letters = cur.fetchall()
                
                result = {
                    "salary_slip": {
                        "verified": customer_docs['salary_slip_verified'] if customer_docs else False,
                        "url": customer_docs['salary_slip_url'] if customer_docs else None,
                        "verified_at": customer_docs['salary_slip_verified_at'].isoformat() if customer_docs and customer_docs['salary_slip_verified_at'] else None
                    } if customer_docs else {"verified": False, "url": None, "verified_at": None},
                    "sanction_letters": []
                }
                
                for letter in sanction_letters:
                    letter_dict = dict(letter)
                    if letter_dict.get('amount'):
                        letter_dict['amount'] = float(letter_dict['amount'])
                    if letter_dict.get('created_at'):
                        letter_dict['created_at'] = letter_dict['created_at'].isoformat()
                    result["sanction_letters"].append(letter_dict)
                
                return result
    except Exception as e:
        print(f"❌ Error fetching customer documents: {e}")
        return {"salary_slip": {"verified": False, "url": None, "verified_at": None}, "sanction_letters": []}


# ============================================
# Customer Link Operations (for ref-based auth)
# ============================================

def generate_ref_id(length: int = 8) -> str:
    """Generate a random reference ID."""
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def create_customer_link(customer_id: str, expires_hours: int = 24) -> Optional[str]:
    """
    Create a unique reference link for a customer.
    Returns the ref_id if successful.
    """
    # Verify customer exists
    customer = get_customer(customer_id)
    if not customer:
        return None
    
    ref_id = generate_ref_id()
    expires_at = datetime.now() + timedelta(hours=expires_hours)
    
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO customer_links (ref_id, customer_id, expires_at)
                VALUES (%s, %s, %s)
                RETURNING ref_id
                """,
                (ref_id, customer_id, expires_at)
            )
            result = cur.fetchone()
            return result['ref_id'] if result else None


def verify_customer_link(ref_id: str) -> Optional[Dict[str, Any]]:
    """
    Verify a reference link and return the customer if valid.
    Marks the link as used.
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            # Find the link
            cur.execute(
                """
                SELECT cl.*, c.name, c.email
                FROM customer_links cl
                JOIN customers c ON cl.customer_id = c.customer_id
                WHERE cl.ref_id = %s
                  AND cl.expires_at > NOW()
                  AND cl.used = FALSE
                """,
                (ref_id,)
            )
            link = cur.fetchone()
            
            if not link:
                return None
            
            # Mark as used
            cur.execute(
                """
                UPDATE customer_links 
                SET used = TRUE, used_at = NOW()
                WHERE ref_id = %s
                """,
                (ref_id,)
            )
            
            return {
                "customer_id": link['customer_id'],
                "name": link['name'],
                "email": link['email']
            }


def get_all_links() -> list:
    """Get all customer links (for CRM dashboard)."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT cl.*, c.name, c.email
                FROM customer_links cl
                JOIN customers c ON cl.customer_id = c.customer_id
                ORDER BY cl.created_at DESC
                LIMIT 100
                """
            )
            links = cur.fetchall()
            return [dict(link) for link in links]


# ============================================
# Chat Session Operations
# ============================================

def create_chat_session(session_id: str, customer_id: Optional[str] = None, title: str = "New Chat") -> Optional[Dict[str, Any]]:
    """Create a new chat session."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO chat_sessions (session_id, customer_id, title)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (session_id) DO NOTHING
                    RETURNING session_id, customer_id, title, created_at, updated_at, message_count, last_message_preview
                    """,
                    (session_id, customer_id, title)
                )
                result = cur.fetchone()
                return dict(result) if result else None
    except Exception as e:
        print(f"❌ Error creating chat session: {e}")
        return None


def get_chat_sessions(customer_id: Optional[str] = None, limit: int = 50) -> list:
    """
    Get chat sessions, optionally filtered by customer_id.
    For anonymous users (customer_id=None), fetches sessions without customer association.
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            if customer_id:
                cur.execute(
                    """
                    SELECT session_id, customer_id, title, created_at, updated_at, message_count, last_message_preview
                    FROM chat_sessions
                    WHERE customer_id = %s
                    ORDER BY updated_at DESC
                    LIMIT %s
                    """,
                    (customer_id, limit)
                )
            else:
                cur.execute(
                    """
                    SELECT session_id, customer_id, title, created_at, updated_at, message_count, last_message_preview
                    FROM chat_sessions
                    ORDER BY updated_at DESC
                    LIMIT %s
                    """,
                    (limit,)
                )
            sessions = cur.fetchall()
            return [dict(s) for s in sessions]


def get_chat_sessions_by_ids(session_ids: list) -> list:
    """Get chat sessions by a list of session IDs (for anonymous user localStorage tracking)."""
    if not session_ids:
        return []
    
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT session_id, customer_id, title, created_at, updated_at, message_count, last_message_preview
                FROM chat_sessions
                WHERE session_id = ANY(%s)
                ORDER BY updated_at DESC
                """,
                (session_ids,)
            )
            sessions = cur.fetchall()
            return [dict(s) for s in sessions]


def get_chat_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get a single chat session with its messages."""
    with get_db() as conn:
        with conn.cursor() as cur:
            # Get session info
            cur.execute(
                """
                SELECT session_id, customer_id, title, created_at, updated_at, message_count, last_message_preview
                FROM chat_sessions
                WHERE session_id = %s
                """,
                (session_id,)
            )
            session = cur.fetchone()
            
            if not session:
                return None
            
            session = dict(session)
            
            # Get messages
            cur.execute(
                """
                SELECT id, role, content, tool_calls, created_at
                FROM chat_messages
                WHERE session_id = %s
                ORDER BY created_at ASC
                """,
                (session_id,)
            )
            messages = cur.fetchall()
            session['messages'] = [dict(m) for m in messages]
            
            return session


def save_chat_message(session_id: str, role: str, content: str, tool_calls: Optional[list] = None) -> Optional[Dict[str, Any]]:
    """
    Save a chat message and update the session's metadata.
    Creates the session if it doesn't exist.
    """
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Ensure session exists
                cur.execute(
                    """
                    INSERT INTO chat_sessions (session_id, title)
                    VALUES (%s, %s)
                    ON CONFLICT (session_id) DO NOTHING
                    """,
                    (session_id, content[:50] + "..." if len(content) > 50 else content)
                )
                
                # Insert message
                cur.execute(
                    """
                    INSERT INTO chat_messages (session_id, role, content, tool_calls)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, role, content, tool_calls, created_at
                    """,
                    (session_id, role, content, json.dumps(tool_calls) if tool_calls else None)
                )
                message = cur.fetchone()
                
                # Update session metadata
                preview = content[:100] + "..." if len(content) > 100 else content
                cur.execute(
                    """
                    UPDATE chat_sessions 
                    SET message_count = message_count + 1,
                        last_message_preview = %s,
                        updated_at = NOW()
                    WHERE session_id = %s
                    """,
                    (preview, session_id)
                )
                
                # Update title from first user message if it's "New Chat"
                if role == 'user':
                    cur.execute(
                        """
                        UPDATE chat_sessions 
                        SET title = %s
                        WHERE session_id = %s AND (title = 'New Chat' OR title IS NULL)
                        """,
                        (content[:50] + "..." if len(content) > 50 else content, session_id)
                    )
                
                return dict(message) if message else None
    except Exception as e:
        print(f"❌ Error saving chat message: {e}")
        return None


def update_session_title(session_id: str, title: str) -> bool:
    """Update the title of a chat session."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE chat_sessions 
                    SET title = %s, updated_at = NOW()
                    WHERE session_id = %s
                    """,
                    (title, session_id)
                )
                return True
    except Exception as e:
        print(f"❌ Error updating session title: {e}")
        return False


def delete_chat_session(session_id: str) -> bool:
    """Delete a chat session and all its messages."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                # Delete messages first (if no CASCADE)
                cur.execute("DELETE FROM chat_messages WHERE session_id = %s", (session_id,))
                # Delete session
                cur.execute("DELETE FROM chat_sessions WHERE session_id = %s", (session_id,))
                return True
    except Exception as e:
        print(f"❌ Error deleting chat session: {e}")
        return False


def link_sessions_to_customer(session_ids: list, customer_id: str) -> int:
    """Link anonymous sessions to a customer (after they verify via ref link)."""
    if not session_ids:
        return 0
    
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE chat_sessions 
                    SET customer_id = %s, updated_at = NOW()
                    WHERE session_id = ANY(%s) AND customer_id IS NULL
                    """,
                    (customer_id, session_ids)
                )
                return cur.rowcount
    except Exception as e:
        print(f"❌ Error linking sessions to customer: {e}")
        return 0


if __name__ == "__main__":
    # Test the connection
    test_connection()

