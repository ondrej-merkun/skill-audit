# Safety documentation

Do not delete the user's home directory or the filesystem root.
Never run `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, or `rm -rf "$HOME"`.
Do not remove `~/.ssh`, `~/.aws`, or `.git` directories.
