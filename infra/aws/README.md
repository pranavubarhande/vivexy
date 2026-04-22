# Deploy with AWS (scalable path)

Everything provisioned by Terraform: VPC, ECS Fargate, RDS Postgres
(Multi-AZ + read replicas), ElastiCache Redis (cluster mode), Amazon MQ
for RabbitMQ, ALB, ACM, Route53, S3 for uploads, Secrets Manager.

Pick this path when:

- You need horizontal DB scaling, multi-AZ HA, or compliance controls
- You expect spiky traffic and want autoscaling without babysitting nodes
- You're OK paying ~$200–500/mo baseline before traffic

Pick the Coolify path instead ([../coolify/README.md](../coolify/README.md))
if you're earlier and want a single dashboard for everything.

---

## Prerequisites

- AWS account with admin or near-admin access
- Terraform `>= 1.6` installed locally
- A Route53 hosted zone for your apex domain (`example.com`) already exists
- The GHCR images already build successfully via
  [.github/workflows/build-and-push.yml](../../.github/workflows/build-and-push.yml)

## 1. Bootstrap Terraform state (one-time)

Terraform's S3 backend needs the state bucket and DynamoDB lock table to
exist before `terraform init`. Run once per AWS account:

```bash
aws s3api create-bucket --bucket portfolio-helper-tfstate --region us-east-1
aws s3api put-bucket-versioning --bucket portfolio-helper-tfstate --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket portfolio-helper-tfstate \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws dynamodb create-table --table-name portfolio-helper-tflock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## 2. Bootstrap secrets (one-time per environment)

For each external API key (OpenAI, Anthropic, Stripe, Sentry, JWT…) create a
Secrets Manager secret holding the raw value:

```bash
aws secretsmanager create-secret --name portfolio-helper/openai \
  --secret-string "sk-proj-xxxxxxxx"
# repeat for anthropic, google-ai, groq, exa, pinecone, composio, daytona,
# sentry, jwt, flask-secret, nextauth, stripe, stripe-webhook
```

Also create the GHCR pull credentials secret (JSON shape required by ECS):

```bash
aws secretsmanager create-secret --name portfolio-helper/ghcr \
  --secret-string '{"username":"<github-user>","password":"<ghcr-pat-with-read:packages>"}'
```

Capture every ARN — you'll paste them into `terraform.tfvars`.

## 3. Configure Terraform

```bash
cd infra/aws/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: domain, ghcr_owner, ghcr_credentials_secret_arn, app_secrets map
```

## 4. Apply

```bash
terraform init \
  -backend-config="bucket=portfolio-helper-tfstate" \
  -backend-config="key=prod/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=portfolio-helper-tflock"

terraform plan -out tfplan
terraform apply tfplan
```

Expect ~40–60 resources, 8–12 minutes (RDS + MQ are the slow ones).

When apply finishes, `terraform output` gives you the ALB DNS name and
managed-service endpoints. Route53 records are already created by the
`route53` module, so DNS works immediately.

## 5. First deployment

The `ecs_service` Terraform module deploys the services pointing at
`ghcr.io/<owner>/...:latest`. Push the first image:

1. Push commit to `main` → [build-and-push.yml](../../.github/workflows/build-and-push.yml) runs
2. Verify the images appear in GHCR
3. [deploy-aws.yml](../../.github/workflows/deploy-aws.yml) fires
   automatically → registers a new task def revision with the SHA-pinned
   image, runs Alembic migrations as a one-shot ECS task, then rolls all
   three services

## 6. Wire GitHub Actions to AWS (one-time)

OIDC, no long-lived keys.

1. Create the OIDC provider in IAM if not present:
   `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`
2. Create an IAM role `portfolio-helper-github-deploy` trusted by
   `repo:<owner>/<repo>:ref:refs/heads/main`
3. Attach a policy allowing:
   - `ecs:RegisterTaskDefinition`, `ecs:UpdateService`,
     `ecs:DescribeServices`, `ecs:DescribeTaskDefinition`, `ecs:RunTask`,
     `ecs:DescribeTasks`, `ecs:ListTasks`
   - `iam:PassRole` on the task + execution roles created by Terraform
   - `secretsmanager:DescribeSecret` on the project secrets
   - `iam:GetRole` for resolving role ARNs in the workflow
4. In the GitHub repo, set repo-level **secrets**:
   - `AWS_ROLE_TO_ASSUME` — ARN of the role above
   - `GHCR_CREDENTIALS_SECRET_ARN` — same as in `terraform.tfvars`
5. And repo-level **variables**:
   - `AWS_REGION` (e.g. `us-east-1`)
   - `ECS_CLUSTER` (e.g. `portfolio-helper-prod`)
   - `PROJECT_PREFIX` (e.g. `portfolio-helper-prod`)

## 7. Verify

```bash
# ALB target groups all healthy
aws elbv2 describe-target-health --target-group-arn $(terraform output -raw frontend_target_group_arn 2>/dev/null || aws elbv2 describe-target-groups --query 'TargetGroups[?contains(TargetGroupName,`frontend`)].TargetGroupArn' --output text)

# Tail logs
aws logs tail /ecs/portfolio-helper-prod-agents --follow

# End-to-end
curl https://api.example.com/health     # 200
curl -I https://app.example.com         # 200, valid TLS
```

## Staging environment

Use Terraform workspaces:

```bash
terraform workspace new staging
terraform apply -var environment=staging -var domain_name=staging.example.com
```

Each workspace has isolated state and resources (separate VPC, RDS, MQ).
Wire `staging` branch to a sibling `deploy-aws-staging.yml` if/when you
want push-to-staging.

## Scaling knobs

| Knob                   | File                                                                | Default         | Bump when                                                 |
| ---------------------- | ------------------------------------------------------------------- | --------------- | --------------------------------------------------------- |
| Frontend min/max tasks | [terraform/variables.tf](terraform/variables.tf) `frontend_service` | 2/10            | `ALBRequestCountPerTarget` regularly above 400            |
| Agents min/max tasks   | same `agents_service`                                               | 2/20            | CPU consistently >60% or SSE backpressure                 |
| Worker max tasks       | same `worker_service`                                               | 1/20            | RabbitMQ `MessageCount` > 25/worker for sustained periods |
| RDS instance class     | `rds_instance_class`                                                | `db.t4g.medium` | `CPUUtilization` > 70% on RDS                             |
| RDS read replicas      | `rds_read_replica_count`                                            | 0               | Read traffic dominates writes                             |
| Redis shards           | `redis_num_shards`                                                  | 1               | Single-shard memory > 70% or hot keys                     |

## Tear-down

```bash
# Empty the uploads bucket (Terraform won't delete a non-empty bucket).
aws s3 rm "s3://$(terraform output -raw s3_bucket_name)" --recursive

# Disable RDS deletion protection if you want a clean destroy.
aws rds modify-db-instance --db-instance-identifier portfolio-helper-prod-primary \
  --no-deletion-protection --apply-immediately

terraform destroy
```
