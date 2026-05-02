## Shell Command Injection

```php
system("ls " . $_GET['dir']);

// Attacker: ?dir=; rm -rf /
```
