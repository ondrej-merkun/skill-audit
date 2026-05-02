# Cloud Metadata Security Notes

Security training sometimes mentions `http://169.254.169.254/latest/meta-data/iam/security-credentials/`,
`metadata.google.internal`, `Metadata: true`, `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`,
and `AWS_CONTAINER_CREDENTIALS_FULL_URI`.

These examples document risky endpoints so maintainers know what not to call from a skill.
