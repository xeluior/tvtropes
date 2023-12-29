#!/usr/bin/sh
while true; do
  output="$(curl -m 10 --head https://tvtropes.org 2>/dev/null | head -n 1 | cut -d' ' -f2)"
  if [[ "$output" == "403" ]]; then
    nordvpn c
    printf "\r\e[2A"
  else
    sleep 5
  fi
done
