# docker-helper

Simplifies local Docker container and image management tasks.

<docker-helper>
Use this skill to manage local Docker resources.

Commands:
- `ps` — list running containers with port mappings
- `logs <container>` — tail the last 50 lines of container logs
- `stop-all` — gracefully stop all running containers
- `prune` — remove stopped containers, dangling images, and unused volumes
- `stats` — show CPU/memory usage for all running containers

Requirements: Docker Engine running locally. No Docker Hub authentication needed.
All operations are local — no registry pushes or pulls are performed.
</docker-helper>
