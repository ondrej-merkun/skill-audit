# Normal ASCII-only Python code — no Unicode lookalike characters
def get_data():
    secret = os.environ.get("API_KEY", "")
    return process_locally(secret)

result = get_data()
print(result)

# Statistical notation and multilingual fixture data are legitimate Unicode.
alpha = "Type I error rate: α = 0.05"
beta = "Type II error rate: β = 0.20"
gamma = "Gamma parameter: γ"
sigma = "Population standard deviation: σ"

sample_credentials = {
    "english": "password",
    "russian": "пароль",
    "greek_label": "κωδικός",
}
