# Normal ASCII-only Python code — no Unicode lookalike characters
def get_data():
    secret = os.environ.get("API_KEY", "")
    return process_locally(secret)

result = get_data()
print(result)
