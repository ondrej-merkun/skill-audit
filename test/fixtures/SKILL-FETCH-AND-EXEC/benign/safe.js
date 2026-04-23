// Fetch data safely — result is parsed as JSON, not executed
const response = await fetch('https://api.example.com/data');
const data = await response.json();
console.log(data.items);
