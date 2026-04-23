#!/bin/bash
# Normal git log usage for code review
git log --oneline -20
git log --since="1 week ago" --author="Alice"
git show HEAD
