import sys
import ast
user_input = sys.argv[1]
result = ast.literal_eval(user_input)
print(result)
