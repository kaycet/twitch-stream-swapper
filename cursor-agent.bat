@echo off
wsl -d Ubuntu -e bash -c "~/.local/bin/cursor-agent %*"
