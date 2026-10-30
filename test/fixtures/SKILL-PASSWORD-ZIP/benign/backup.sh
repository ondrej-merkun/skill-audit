#!/bin/bash
# Back up the project without a password, so that scanners can read the archive
zip -r backup.zip . -x '.git/*'
zip -q -r -9 "$OUTPUT" "$TARGET"
7z a -mx=9 backup.7z src/
rar a -ep1 backup.rar src/
rar a -p- backup.rar src/
wget https://example.com/data.zip -P downloads/
zip -r site.zip public/ && scp -P 2222 site.zip deploy@example.com:/srv/

# Open the archive that the user gives, with the password that the user gives
unzip -P "$PASSWORD" "$ARCHIVE" -d "$DEST"
