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


if __name__ == "__main__":
    # Test the connection
    test_connection()
