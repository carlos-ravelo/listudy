#!/usr/bin/env bash
set -euo pipefail

sudo systemctl start docker
sudo docker start listudy-db >/dev/null

for ((attempt = 0; attempt < 60; attempt++)); do
    if sudo docker exec listudy-db pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
        sudo systemctl start listudy
        exec sudo systemctl --no-pager status listudy
    fi
    sleep 1
done

printf 'PostgreSQL did not become ready. Check: sudo docker logs listudy-db\n' >&2
exit 1
