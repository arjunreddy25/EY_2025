import os
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

def get_s3_client():
    """Create and return an S3 client."""
    if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME]):
        return None

    try:
        return boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
    except Exception as e:
        print(f"❌ Failed to create S3 client: {e}")
        return None

def upload_file_to_s3(file_path: str, object_name: str = None) -> str:
    """
    Upload a file to an S3 bucket and return the URL.
    
    :param file_path: File to upload
    :param object_name: S3 object name. If not specified then file_name is used
    :return: URL of the uploaded file or None if failed
    """
    client = get_s3_client()
    if not client:
        return None

    # If S3 object_name was not specified, use file_name
    if object_name is None:
        object_name = os.path.basename(file_path)

    try:
        # Upload the file
        client.upload_file(
            file_path, 
            AWS_BUCKET_NAME, 
            object_name,
            ExtraArgs={'ContentType': 'application/pdf'} # Bucket Policy determines access
        )
        
        # In many modern S3 setups, public ACLs are blocked. 
        # If so, we might need to generate a presigned URL or just return the standard URL format.
        # Let's try to return the standard URL first.
        
        url = f"https://{AWS_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{object_name}"
        print(f"✅ Uploaded to S3: {url}")
        return url

    except ClientError as e:
        print(f"❌ S3 Upload Error: {e}")
        return None
    except Exception as e:
        print(f"❌ Error uploading to S3: {e}")
        return None

def generate_presigned_url(object_name: str, expiration=3600) -> str:
    """Generate a presigned URL to share an S3 object"""
    client = get_s3_client()
    if not client:
        return None

    try:
        response = client.generate_presigned_url('get_object',
                                                    Params={'Bucket': AWS_BUCKET_NAME,
                                                            'Key': object_name},
                                                    ExpiresIn=expiration)
        return response
    except ClientError as e:
        print(f"❌ Error generating presigned URL: {e}")
        return None
