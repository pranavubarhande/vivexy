# Remote state. Bucket + DynamoDB table must already exist before running
# `terraform init`. The README has a one-time bootstrap snippet.
#
# Fill these via `-backend-config` flags on init, e.g.:
#   terraform init \
#     -backend-config="bucket=portfolio-helper-tfstate" \
#     -backend-config="key=prod/terraform.tfstate" \
#     -backend-config="region=us-east-1" \
#     -backend-config="dynamodb_table=portfolio-helper-tflock"

terraform {
  backend "s3" {
    encrypt = true
  }
}
