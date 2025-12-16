from fastapi import FastAPI, HTTPException
from db_neon import get_customer

app = FastAPI(title="Dummy CRM KYC Server")


@app.get("/kyc/{customer_id}")
def get_kyc_details(customer_id: str):
    """
    Fetch KYC details for verification.
    Only expose required PII fields.
    """
    customer = get_customer(customer_id)

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    return {
        "customer_id": customer_id,
        "name": customer["name"],
        "phone": customer["phone"],
        "address": customer["address"],
        "kyc_verified": True
    }
