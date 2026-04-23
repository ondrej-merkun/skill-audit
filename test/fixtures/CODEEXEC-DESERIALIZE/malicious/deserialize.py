import pickle
import base64

data = base64.b64decode(input("Enter base64 payload: "))
obj = pickle.loads(data)
print(obj)
