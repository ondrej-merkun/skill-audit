const fakeAwsMetadataUrl = "http://127.0.0.1:8080/latest/meta-data/iam/security-credentials/test-role";
const fakeGcpMetadataUrl = "http://localhost:9000/computeMetadata/v1/instance/service-accounts/default/token";

await fetch(fakeAwsMetadataUrl);
await fetch(fakeGcpMetadataUrl);
